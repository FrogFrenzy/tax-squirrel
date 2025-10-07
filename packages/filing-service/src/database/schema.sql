-- Filing submissions table
CREATE TABLE IF NOT EXISTS filing_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tax_return_id UUID NOT NULL,
    submission_type VARCHAR(20) NOT NULL CHECK (submission_type IN ('original', 'amended', 'superseding')),
    filing_method VARCHAR(20) NOT NULL CHECK (filing_method IN ('electronic', 'paper')),
    status VARCHAR(30) NOT NULL CHECK (status IN ('draft', 'validating', 'ready_to_submit', 'submitted', 'transmitted', 'acknowledged', 'accepted', 'rejected', 'processing', 'processed', 'refund_issued', 'payment_due')),
    submitted_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE,
    confirmation_number VARCHAR(50),
    acknowledgment_id VARCHAR(50),
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax form XML storage
CREATE TABLE IF NOT EXISTS tax_form_xml (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id UUID NOT NULL REFERENCES filing_submissions(id) ON DELETE CASCADE,
    form_type VARCHAR(20) NOT NULL,
    tax_year INTEGER NOT NULL,
    xml_content TEXT NOT NULL,
    schema_version VARCHAR(20) NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IRS acknowledgments
CREATE TABLE IF NOT EXISTS irs_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id UUID NOT NULL REFERENCES filing_submissions(id) ON DELETE CASCADE,
    acknowledgment_id VARCHAR(50) NOT NULL UNIQUE,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('accepted', 'rejected', 'partially_accepted')),
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    refund_amount DECIMAL(12,2),
    amount_owed DECIMAL(12,2),
    due_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- State filing information
CREATE TABLE IF NOT EXISTS state_filings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id UUID NOT NULL REFERENCES filing_submissions(id) ON DELETE CASCADE,
    state VARCHAR(2) NOT NULL,
    filing_required BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    estimated_tax DECIMAL(12,2),
    estimated_refund DECIMAL(12,2),
    due_date DATE,
    confirmation_number VARCHAR(50),
    submitted_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Filing batches for bulk processing
CREATE TABLE IF NOT EXISTS filing_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'submitted', 'processing', 'completed', 'failed')),
    total_submissions INTEGER NOT NULL DEFAULT 0,
    accepted_count INTEGER NOT NULL DEFAULT 0,
    rejected_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Filing batch submissions (many-to-many relationship)
CREATE TABLE IF NOT EXISTS filing_batch_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES filing_batches(id) ON DELETE CASCADE,
    filing_id UUID NOT NULL REFERENCES filing_submissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(batch_id, filing_id)
);

-- Refund tracking
CREATE TABLE IF NOT EXISTS refund_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id UUID NOT NULL REFERENCES filing_submissions(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'sent', 'deposited', 'returned', 'offset')),
    method VARCHAR(20) NOT NULL CHECK (method IN ('direct_deposit', 'check', 'savings_bond')),
    expected_date DATE,
    routing_number_encrypted TEXT,
    account_number_encrypted TEXT,
    account_type VARCHAR(10) CHECK (account_type IN ('checking', 'savings')),
    bank_name VARCHAR(100),
    tracking_number VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Filing validation results
CREATE TABLE IF NOT EXISTS filing_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id UUID NOT NULL REFERENCES filing_submissions(id) ON DELETE CASCADE,
    validation_type VARCHAR(20) NOT NULL CHECK (validation_type IN ('schema', 'business_rules', 'calculations')),
    is_valid BOOLEAN NOT NULL,
    errors JSONB DEFAULT '[]',
    warnings JSONB DEFAULT '[]',
    readiness_score INTEGER CHECK (readiness_score >= 0 AND readiness_score <= 100),
    missing_requirements JSONB DEFAULT '[]',
    validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Filing transmission log
CREATE TABLE IF NOT EXISTS filing_transmissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filing_id UUID NOT NULL REFERENCES filing_submissions(id) ON DELETE CASCADE,
    transmission_id VARCHAR(50) NOT NULL,
    endpoint_url VARCHAR(500) NOT NULL,
    request_payload TEXT,
    response_payload TEXT,
    http_status INTEGER,
    transmission_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    response_time_ms INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_filing_submissions_user_id ON filing_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_filing_submissions_tax_return_id ON filing_submissions(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_filing_submissions_status ON filing_submissions(status);
CREATE INDEX IF NOT EXISTS idx_filing_submissions_submitted_at ON filing_submissions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_filing_submissions_confirmation_number ON filing_submissions(confirmation_number);
CREATE INDEX IF NOT EXISTS idx_filing_submissions_acknowledgment_id ON filing_submissions(acknowledgment_id);

CREATE INDEX IF NOT EXISTS idx_tax_form_xml_filing_id ON tax_form_xml(filing_id);
CREATE INDEX IF NOT EXISTS idx_tax_form_xml_form_type ON tax_form_xml(form_type);
CREATE INDEX IF NOT EXISTS idx_tax_form_xml_tax_year ON tax_form_xml(tax_year);

CREATE INDEX IF NOT EXISTS idx_irs_acknowledgments_filing_id ON irs_acknowledgments(filing_id);
CREATE INDEX IF NOT EXISTS idx_irs_acknowledgments_acknowledgment_id ON irs_acknowledgments(acknowledgment_id);
CREATE INDEX IF NOT EXISTS idx_irs_acknowledgments_timestamp ON irs_acknowledgments(timestamp);

CREATE INDEX IF NOT EXISTS idx_state_filings_filing_id ON state_filings(filing_id);
CREATE INDEX IF NOT EXISTS idx_state_filings_state ON state_filings(state);
CREATE INDEX IF NOT EXISTS idx_state_filings_status ON state_filings(status);

CREATE INDEX IF NOT EXISTS idx_filing_batches_batch_number ON filing_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_filing_batches_status ON filing_batches(status);
CREATE INDEX IF NOT EXISTS idx_filing_batches_created_at ON filing_batches(created_at);

CREATE INDEX IF NOT EXISTS idx_filing_batch_submissions_batch_id ON filing_batch_submissions(batch_id);
CREATE INDEX IF NOT EXISTS idx_filing_batch_submissions_filing_id ON filing_batch_submissions(filing_id);

CREATE INDEX IF NOT EXISTS idx_refund_tracking_filing_id ON refund_tracking(filing_id);
CREATE INDEX IF NOT EXISTS idx_refund_tracking_status ON refund_tracking(status);
CREATE INDEX IF NOT EXISTS idx_refund_tracking_expected_date ON refund_tracking(expected_date);

CREATE INDEX IF NOT EXISTS idx_filing_validations_filing_id ON filing_validations(filing_id);
CREATE INDEX IF NOT EXISTS idx_filing_validations_validation_type ON filing_validations(validation_type);
CREATE INDEX IF NOT EXISTS idx_filing_validations_validated_at ON filing_validations(validated_at);

CREATE INDEX IF NOT EXISTS idx_filing_transmissions_filing_id ON filing_transmissions(filing_id);
CREATE INDEX IF NOT EXISTS idx_filing_transmissions_transmission_id ON filing_transmissions(transmission_id);
CREATE INDEX IF NOT EXISTS idx_filing_transmissions_transmission_time ON filing_transmissions(transmission_time);

-- Update triggers for updated_at columns
CREATE TRIGGER update_filing_submissions_updated_at BEFORE UPDATE ON filing_submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_state_filings_updated_at BEFORE UPDATE ON state_filings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refund_tracking_updated_at BEFORE UPDATE ON refund_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();