const DB_NAME = 'VoicevoxCache';
const STORE_NAME = 'audioBlobs';
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Initializes and returns the IndexedDB instance.
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

/**
 * Retrieves a Blob from IndexedDB by its cache key.
 * @param {string} key
 * @returns {Promise<Blob|null>}
 */
export async function getAudio(key) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (err) {
    console.warn('Failed to get audio from IndexedDB:', err);
    return null;
  }
}

/**
 * Saves a Blob to IndexedDB with the given cache key.
 * @param {string} key
 * @param {Blob} blob
 * @returns {Promise<void>}
 */
export async function saveAudio(key, blob) {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(blob, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to save audio to IndexedDB:', err);
  }
}

/**
 * Clears all stored audio blobs from IndexedDB.
 * @returns {Promise<void>}
 */
export async function clearAudioCache() {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn('Failed to clear audio cache:', err);
  }
}
