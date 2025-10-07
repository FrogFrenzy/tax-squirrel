-- Tax returns table
CREATE TABLE IF NOT EXISTS tax_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tax_year INTEGER NOT NULL,
    filing_status VARCHAR(30) NOT NULL CHECK (filing_status IN ('single', 'marriedFilingJointly', 'marriedFilingSeparately', 'headOfHousehold', 'qualifyingWidow')),
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'in_review', 'ready_to_file', 'filed', 'accepted', 'rejected', 'amended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_modified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    accepted_at TIMESTAMP WITH TIME ZONE
);

-- Tax return income summary
CREATE TABLE IF NOT EXISTS tax_return_income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    total_income DECIMAL(12,2) DEFAULT 0,
    adjusted_gross_income DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wage income (W-2)
CREATE TABLE IF NOT EXISTS wage_income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    employer_name VARCHAR(100) NOT NULL,
    employer_ein VARCHAR(10) NOT NULL,
    wages DECIMAL(12,2) NOT NULL,
    federal_tax_withheld DECIMAL(12,2) NOT NULL,
    social_security_wages DECIMAL(12,2) NOT NULL,
    social_security_tax_withheld DECIMAL(12,2) NOT NULL,
    medicare_wages DECIMAL(12,2) NOT NULL,
    medicare_tax_withheld DECIMAL(12,2) NOT NULL,
    state_wages DECIMAL(12,2),
    state_tax_withheld DECIMAL(12,2),
    w2_document_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Self-employment income
CREATE TABLE IF NOT EXISTS self_employment_income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    business_name VARCHAR(100) NOT NULL,
    business_type VARCHAR(30) NOT NULL,
    gross_receipts DECIMAL(12,2) NOT NULL,
    business_expenses DECIMAL(12,2) NOT NULL,
    net_profit DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Investment income
CREATE TABLE IF NOT EXISTS investment_income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    taxable_amount DECIMAL(12,2) NOT NULL,
    form1099_document_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Retirement income
CREATE TABLE IF NOT EXISTS retirement_income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    payer_name VARCHAR(100) NOT NULL,
    gross_distribution DECIMAL(12,2) NOT NULL,
    taxable_amount DECIMAL(12,2) NOT NULL,
    federal_tax_withheld DECIMAL(12,2) NOT NULL,
    form1099r_document_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Other income
CREATE TABLE IF NOT EXISTS other_income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    taxable BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax return deductions summary
CREATE TABLE IF NOT EXISTS tax_return_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    standard_deduction DECIMAL(12,2) DEFAULT 0,
    total_itemized_deductions DECIMAL(12,2) DEFAULT 0,
    deduction_method VARCHAR(10) DEFAULT 'standard' CHECK (deduction_method IN ('standard', 'itemized')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Itemized deductions
CREATE TABLE IF NOT EXISTS itemized_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    category VARCHAR(30) NOT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    limitation DECIMAL(12,2),
    supporting_documents JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Business deductions
CREATE TABLE IF NOT EXISTS business_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    business_id UUID NOT NULL,
    category VARCHAR(30) NOT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Income adjustments
CREATE TABLE IF NOT EXISTS income_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax return credits summary
CREATE TABLE IF NOT EXISTS tax_return_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    child_tax_credit DECIMAL(12,2) DEFAULT 0,
    earned_income_credit DECIMAL(12,2) DEFAULT 0,
    education_credits DECIMAL(12,2) DEFAULT 0,
    retirement_savings_credit DECIMAL(12,2) DEFAULT 0,
    total_credits DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Other credits
CREATE TABLE IF NOT EXISTS other_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    description VARCHAR(200) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax calculations
CREATE TABLE IF NOT EXISTS tax_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    gross_income DECIMAL(12,2) DEFAULT 0,
    adjusted_gross_income DECIMAL(12,2) DEFAULT 0,
    taxable_income DECIMAL(12,2) DEFAULT 0,
    federal_tax_before_credits DECIMAL(12,2) DEFAULT 0,
    total_credits DECIMAL(12,2) DEFAULT 0,
    federal_tax_after_credits DECIMAL(12,2) DEFAULT 0,
    self_employment_tax DECIMAL(12,2) DEFAULT 0,
    total_tax_liability DECIMAL(12,2) DEFAULT 0,
    total_withholding DECIMAL(12,2) DEFAULT 0,
    estimated_payments DECIMAL(12,2) DEFAULT 0,
    refund_amount DECIMAL(12,2) DEFAULT 0,
    amount_owed DECIMAL(12,2) DEFAULT 0,
    effective_tax_rate DECIMAL(5,4) DEFAULT 0,
    marginal_tax_rate DECIMAL(5,4) DEFAULT 0,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax forms
CREATE TABLE IF NOT EXISTS tax_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    form_type VARCHAR(20) NOT NULL,
    form_data JSONB NOT NULL DEFAULT '{}',
    is_complete BOOLEAN DEFAULT FALSE,
    validation_errors JSONB DEFAULT '[]',
    generated_pdf TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tax law configurations
CREATE TABLE IF NOT EXISTS tax_law_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_year INTEGER NOT NULL UNIQUE,
    standard_deductions JSONB NOT NULL,
    tax_brackets JSONB NOT NULL,
    social_security_wage_base DECIMAL(12,2) NOT NULL,
    social_security_rate DECIMAL(5,4) NOT NULL,
    medicare_rate DECIMAL(5,4) NOT NULL,
    additional_medicare_rate DECIMAL(5,4) NOT NULL,
    additional_medicare_threshold JSONB NOT NULL,
    personal_exemption DECIMAL(12,2) NOT NULL,
    child_tax_credit_amount DECIMAL(12,2) NOT NULL,
    child_tax_credit_phaseout_threshold JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Deduction recommendations
CREATE TABLE IF NOT EXISTS deduction_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tax_return_id UUID NOT NULL REFERENCES tax_returns(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    estimated_amount DECIMAL(12,2) NOT NULL,
    confidence DECIMAL(3,2) NOT NULL,
    required_documents JSONB DEFAULT '[]',
    potential_savings DECIMAL(12,2) NOT NULL,
    is_applied BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tax_returns_user_id ON tax_returns(user_id);
CREATE INDEX IF NOT EXISTS idx_tax_returns_tax_year ON tax_returns(tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_returns_status ON tax_returns(status);
CREATE INDEX IF NOT EXISTS idx_tax_return_income_tax_return_id ON tax_return_income(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_wage_income_tax_return_id ON wage_income(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_self_employment_income_tax_return_id ON self_employment_income(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_investment_income_tax_return_id ON investment_income(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_retirement_income_tax_return_id ON retirement_income(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_other_income_tax_return_id ON other_income(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_tax_return_deductions_tax_return_id ON tax_return_deductions(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_itemized_deductions_tax_return_id ON itemized_deductions(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_business_deductions_tax_return_id ON business_deductions(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_income_adjustments_tax_return_id ON income_adjustments(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_tax_return_credits_tax_return_id ON tax_return_credits(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_other_credits_tax_return_id ON other_credits(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_tax_calculations_tax_return_id ON tax_calculations(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_tax_forms_tax_return_id ON tax_forms(tax_return_id);
CREATE INDEX IF NOT EXISTS idx_tax_law_configurations_tax_year ON tax_law_configurations(tax_year);
CREATE INDEX IF NOT EXISTS idx_deduction_recommendations_tax_return_id ON deduction_recommendations(tax_return_id);

-- Update triggers for updated_at columns
CREATE TRIGGER update_tax_return_income_updated_at BEFORE UPDATE ON tax_return_income
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_return_deductions_updated_at BEFORE UPDATE ON tax_return_deductions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_return_credits_updated_at BEFORE UPDATE ON tax_return_credits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_forms_updated_at BEFORE UPDATE ON tax_forms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_law_configurations_updated_at BEFORE UPDATE ON tax_law_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default tax law configurations for 2024
INSERT INTO tax_law_configurations (
    tax_year, standard_deductions, tax_brackets, social_security_wage_base,
    social_security_rate, medicare_rate, additional_medicare_rate,
    additional_medicare_threshold, personal_exemption, child_tax_credit_amount,
    child_tax_credit_phaseout_threshold
) VALUES (
    2024,
    '{"single": 14600, "marriedFilingJointly": 29200, "marriedFilingSeparately": 14600, "headOfHousehold": 21900, "qualifyingWidow": 29200}',
    '{"single": [{"min": 0, "max": 11000, "rate": 0.10}, {"min": 11000, "max": 44725, "rate": 0.12}, {"min": 44725, "max": 95375, "rate": 0.22}, {"min": 95375, "max": 197050, "rate": 0.24}, {"min": 197050, "max": 250525, "rate": 0.32}, {"min": 250525, "max": 626350, "rate": 0.35}, {"min": 626350, "max": 999999999, "rate": 0.37}]}',
    168600,
    0.062,
    0.0145,
    0.009,
    '{"single": 200000, "marriedFilingJointly": 250000, "marriedFilingSeparately": 125000, "headOfHousehold": 200000, "qualifyingWidow": 250000}',
    0,
    2000,
    '{"single": 200000, "marriedFilingJointly": 400000, "marriedFilingSeparately": 200000, "headOfHousehold": 200000, "qualifyingWidow": 400000}'
) ON CONFLICT (tax_year) DO NOTHING;