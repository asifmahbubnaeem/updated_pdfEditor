import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout for file operations
});

// Request interceptor - Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    // Add user ID for rate limiting (if not authenticated)
    const userId = localStorage.getItem('userId');
    if (userId && !token) {
      config.data = {
        ...config.data,
        userId: userId,
      };
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - Handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Handle 429 Rate Limit
    if (error.response?.status === 429) {
      const retryAfter = error.response.data?.retryAfter;
      console.warn(`Rate limit exceeded. Retry after ${retryAfter} seconds.`);
    }

    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message);
    }

    return Promise.reject(error);
  }
);

// Helper function to create FormData with userId
const createFormData = (data) => {
  const formData = new FormData();
  Object.keys(data).forEach(key => {
    if (Array.isArray(data[key])) {
      data[key].forEach(item => formData.append(key, item));
    } else {
      formData.append(key, data[key]);
    }
  });
  
  const userId = localStorage.getItem('userId');
  if (userId) {
    formData.append('userId', userId);
  }
  
  return formData;
};

// API helper functions
export const apiService = {
  // Auth endpoints
  async login(email, password) {
    const response = await api.post('/api/auth/login', { email, password });
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  async register(email, password) {
    const response = await api.post('/api/auth/register', { email, password });
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  async logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    return api.post('/api/auth/logout');
  },

  async getCurrentUser() {
    const response = await api.get('/api/auth/me');
    return response.data;
  },

  // PDF operations
  async encryptPdf(file, password) {
    const formData = createFormData({ file, password });
    return api.post('/api/encrypt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async decryptPdf(file, password) {
    const formData = createFormData({ file, password });
    return api.post('/api/decrypt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async mergePdfs(files) {
    const formData = createFormData({ pdfs: files });
    return api.post('/api/merge-pdfs', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async compressPdf(file, quality) {
    const formData = createFormData({ file, compress_quality: quality });
    return api.post('/api/compress-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async extractImages(file) {
    const formData = createFormData({ file });
    return api.post('/api/extract-images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'json',
    });
  },

  async extractTables(file, format) {
    const formData = createFormData({ file, format });
    return api.post('/api/extract-tables', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'json',
    });
  },

  async convertDoc(file) {
    const formData = createFormData({ file });
    return api.post('/api/convert', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async convertImage(file, fileType) {
    const formData = createFormData({ file, fileType });
    return api.post('/api/convert-img', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async csvToPdf(file) {
    const formData = createFormData({ file });
    return api.post('/api/csv-to-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'json',
    });
  },

  async deletePages(file, deletedPageNo) {
    const formData = createFormData({ file, deleted_page_no: deletedPageNo });
    return api.post('/api/delete-pages', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async convertPdfToDocx(file) {
    const formData = createFormData({ file });
    return api.post('/api/convert-pdf-docx', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async imageToTableData(file, format, mimeType) {
    const formData = createFormData({ file, format, mime_type: mimeType });
    return api.post('/api/img-to-tbl-data', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'json',
    });
  },

  async imageToTextData(file, format, mimeType) {
    const formData = createFormData({ file, format, mime_type: mimeType });
    return api.post('/api/img-to-txt-data', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'json',
    });
  },

  async pageDelRotation(file, deletedPage, rotationInfo) {
    const formData = createFormData({ 
      file, 
      deletedPage: Array.isArray(deletedPage) ? deletedPage : [deletedPage],
      rotationInfo: typeof rotationInfo === 'string' ? rotationInfo : JSON.stringify(rotationInfo)
    });
    return api.post('/api/page-del-rotation', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  async pageRearrange(file) {
    const formData = createFormData({ file });
    return api.post('/api/page-rearrange', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    });
  },

  // Usage tracking
  async getUsageStats() {
    const response = await api.get('/api/usage/stats');
    return response.data;
  },

  async getUsageHistory(limit = 10) {
    const response = await api.get(`/api/usage/history?limit=${limit}`);
    return response.data;
  },

  // Subscription endpoints
  async getSubscription() {
    const response = await api.get('/api/subscription');
    return response.data;
  },

  async createCheckoutSession(priceId) {
    const response = await api.post('/api/payment/create-checkout', { priceId });
    return response.data;
  },

  async downloadFile(downloadUrl, filename = 'download') {
    const response = await api.get(downloadUrl, {
      responseType: 'blob',
    });
    downloadBlob(response.data, filename);
  },
};

// Utility function for downloading blobs
export const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

// Utility function for handling API errors
export const handleApiError = (error, handleRateLimit) => {
  if (error.response?.status === 429 && handleRateLimit) {
    handleRateLimit(error.response.data);
    return true;
  }
  return false;
};

export default api;
