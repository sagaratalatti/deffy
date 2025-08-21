import * as admin from 'firebase-admin';

/**
 * FirebaseService handles all Firestore database operations
 * Used for storing encrypted wallet data and DAO information
 */
export class FirebaseService {
  private db: admin.firestore.Firestore;

  constructor() {
    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }

    this.db = admin.firestore();
  }

  /**
   * Set a document in Firestore
   */
  async setDocument(path: string, data: any): Promise<void> {
    try {
      await this.db.doc(path).set(data, { merge: true });
    } catch (error) {
      console.error(`Error setting document ${path}:`, error);
      throw error;
    }
  }

  /**
   * Get a document from Firestore
   */
  async getDocument(path: string): Promise<any> {
    try {
      const doc = await this.db.doc(path).get();
      return doc.exists ? doc.data() : null;
    } catch (error) {
      console.error(`Error getting document ${path}:`, error);
      throw error;
    }
  }

  /**
   * Update a document in Firestore
   */
  async updateDocument(path: string, data: any): Promise<void> {
    try {
      await this.db.doc(path).update(data);
    } catch (error) {
      console.error(`Error updating document ${path}:`, error);
      throw error;
    }
  }

  /**
   * Delete a document from Firestore
   */
  async deleteDocument(path: string): Promise<void> {
    try {
      await this.db.doc(path).delete();
    } catch (error) {
      console.error(`Error deleting document ${path}:`, error);
      throw error;
    }
  }

  /**
   * Get a collection from Firestore
   */
  async getCollection(path: string): Promise<any[]> {
    try {
      const snapshot = await this.db.collection(path).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Error getting collection ${path}:`, error);
      throw error;
    }
  }

  /**
   * Query collection with conditions
   */
  async queryCollection(path: string, field: string, operator: FirebaseFirestore.WhereFilterOp, value: any): Promise<any[]> {
    try {
      const snapshot = await this.db.collection(path).where(field, operator, value).get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error(`Error querying collection ${path}:`, error);
      throw error;
    }
  }

  /**
   * Add document to collection with auto-generated ID
   */
  async addDocument(path: string, data: any): Promise<string> {
    try {
      const docRef = await this.db.collection(path).add(data);
      return docRef.id;
    } catch (error) {
      console.error(`Error adding document to ${path}:`, error);
      throw error;
    }
  }

  /**
   * Batch write operations
   */
  async batchWrite(operations: Array<{ type: 'set' | 'update' | 'delete', path: string, data?: any }>): Promise<void> {
    try {
      const batch = this.db.batch();
      
      operations.forEach(op => {
        const docRef = this.db.doc(op.path);
        
        switch (op.type) {
          case 'set':
            batch.set(docRef, op.data);
            break;
          case 'update':
            batch.update(docRef, op.data);
            break;
          case 'delete':
            batch.delete(docRef);
            break;
        }
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error in batch write:', error);
      throw error;
    }
  }
}