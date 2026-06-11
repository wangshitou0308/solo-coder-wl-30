import axios from 'axios';

const toCamelCase = (str) => str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const toSnakeCase = (str) => str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const convertKeys = (obj, converter) => {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(item => convertKeys(item, converter));
  if (typeof obj !== 'object') return obj;

  const result = {};
  Object.keys(obj).forEach(key => {
    const newKey = converter(key);
    result[newKey] = convertKeys(obj[key], converter);
  });
  return result;
};

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.data && typeof config.data === 'object') {
      config.data = convertKeys(config.data, toSnakeCase);
    }
    if (config.params && typeof config.params === 'object') {
      config.params = convertKeys(config.params, toSnakeCase);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object') {
      response.data = convertKeys(response.data, toCamelCase);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    if (error.response?.data && typeof error.response.data === 'object') {
      error.response.data = convertKeys(error.response.data, toCamelCase);
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const performanceAPI = {
  list: (params) => api.get('/performances', { params }),
  get: (id) => api.get(`/performances/${id}`),
  create: (data) => api.post('/performances', data),
  update: (id, data) => api.put(`/performances/${id}`, data),
  approve: (id) => api.post(`/performances/${id}/approve`),
  reject: (id, data) => api.post(`/performances/${id}/reject`, data),
  delete: (id) => api.delete(`/performances/${id}`),
};

export const showAPI = {
  list: (params) => api.get('/shows', { params }),
  get: (id) => api.get(`/shows/${id}`),
  create: (data) => api.post('/shows', data),
  batchCreate: (data) => api.post('/shows/batch', data),
  updateStatus: (id, status) => api.put(`/shows/${id}/status`, { status }),
  addShow: (id, data) => api.post(`/shows/${id}/add-show`, data),
  checkConflict: (params) => api.get('/shows/conflicts/check', { params }),
};

export const theaterAPI = {
  listTheaters: () => api.get('/theaters'),
  createTheater: (data) => api.post('/theaters', data),
  listGroups: () => api.get('/groups'),
  createGroup: (data) => api.post('/groups', data),
  listTemplates: (params) => api.get('/seat-templates', { params }),
  createTemplate: (data) => api.post('/seat-templates', data),
  generateTemplate: (id, data) => api.post(`/theaters/${id}/generate-template`, data),
};

export const ticketAPI = {
  getTicketVersion: (showId) => api.get(`/tickets/shows/${showId}/ticket-version`),
  createTicketVersion: (showId, data) => api.post(`/tickets/shows/${showId}/ticket-version`, data),
  lockSeat: (showId, seatId, data) => api.post(`/tickets/shows/${showId}/seats/${seatId}/lock`, data),
  unlockSeat: (showId, seatId) => api.post(`/tickets/shows/${showId}/seats/${seatId}/unlock`),
  releaseExpiredLocks: () => api.post('/tickets/release-expired-locks'),
  getDiscounts: (showId) => api.get(`/tickets/shows/${showId}/discounts`),
};

export const orderAPI = {
  holdSeats: (data) => api.post('/orders/hold-seats', data),
  create: (data) => api.post('/orders/create', data),
  pay: (id, data) => api.post(`/orders/${id}/pay`, data),
  cancelExpired: () => api.post('/orders/cancel-expired'),
  list: (params) => api.get('/orders', { params }),
  get: (id) => api.get(`/orders/${id}`),
  refund: (id, data) => api.post(`/orders/${id}/refund`, data),
};

export const statsAPI = {
  getBoxOffice: (showId) => api.get(`/statistics/shows/${showId}/box-office`),
  getSummary: (params) => api.get('/statistics/box-office/summary', { params }),
  getSettlement: (showId) => api.get(`/statistics/shows/${showId}/settlement`),
  createSettlement: (showId, data) => api.post(`/statistics/shows/${showId}/settlement/create`, data),
  getRepertoire: () => api.get('/statistics/repertoire'),
  getAudienceAnalysis: (params) => api.get('/statistics/analysis/audience-preference', { params }),
  getSettlements: (params) => api.get('/statistics/settlements', { params }),
};

export default api;
