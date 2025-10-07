import { Router } from 'express';
import { DocumentController } from '../controllers/DocumentController';

export function createDocumentRoutes(documentController: DocumentController): Router {
  const router = Router();

  // Public routes
  router.get('/health', documentController.healthCheck);
  router.get('/processing-status', documentController.getProcessingStatus);

  // Protected routes (authentication middleware will be applied in main app)
  router.post('/upload', documentController.uploadDocument);
  router.get('/', documentController.getDocuments);
  router.get('/stats', documentController.getDocumentStats);
  router.get('/audit-trail', documentController.getAuditTrail);
  router.get('/:id', documentController.getDocument);
  router.delete('/:id', documentController.deleteDocument);
  router.post('/:id/verify', documentController.verifyDocument);
  router.get('/:id/download', documentController.getDocumentDownloadUrl);
  router.post('/:id/reprocess', documentController.reprocessDocument);
  router.post('/:id/correct-data', documentController.correctExtractedData);

  return router;
}