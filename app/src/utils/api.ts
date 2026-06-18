import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptionUtils from './encryption';
import { getToken, setToken } from './tokenStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Authentication APIs
 */
export const authAPI = {
  register: async (username: string, password: string) => {
    const res = await api.post('/auth/register', { username, password });
    // Store token and user keys
    await setToken(res.data.token);
    await AsyncStorage.setItem('userId', res.data.user.id);
    await AsyncStorage.setItem('publicKey', res.data.user.publicKey);
    return res.data;
  },

  login: async (username: string, password: string) => {
    const res = await api.post('/auth/login', { username, password });
    // Store token and user keys
    await setToken(res.data.token);
    await AsyncStorage.setItem('userId', res.data.user.id);
    await AsyncStorage.setItem('publicKey', res.data.user.publicKey);
    return res.data;
  },

  getUserKeys: async (userId: string) => {
    const res = await api.get(`/auth/user-keys/${userId}`);
    return res.data;
  }
};

/**
 * Conversation APIs
 */
export const conversationAPI = {
  getAll: async () => {
    const res = await api.get('/conversations');
    return res.data;
  },

  getById: async (conversationId: string) => {
    const res = await api.get(`/conversations/${conversationId}`);
    return res.data;
  },

  create1on1: async (recipientId: string) => {
    const res = await api.post('/conversations', { recipientId });
    return res.data;
  },

  createGroup: async (groupName: string, participantIds: string[], description?: string, groupIcon?: string) => {
    const res = await api.post('/conversations/group/create', {
      groupName,
      participantIds,
      description,
      groupIcon
    });
    return res.data;
  },

  addMember: async (conversationId: string, memberId: string) => {
    const res = await api.put(`/conversations/${conversationId}/add-member`, { memberId });
    return res.data;
  },

  removeMember: async (conversationId: string, memberId: string) => {
    const res = await api.put(`/conversations/${conversationId}/remove-member`, { memberId });
    return res.data;
  },

  mute: async (conversationId: string) => {
    const res = await api.put(`/conversations/${conversationId}/mute`);
    return res.data;
  },

  unmute: async (conversationId: string) => {
    const res = await api.put(`/conversations/${conversationId}/unmute`);
    return res.data;
  },

  delete: async (conversationId: string) => {
    const res = await api.delete(`/conversations/${conversationId}`);
    return res.data;
  }
};

/**
 * Message APIs
 */
export const messageAPI = {
  getAll: async (conversationId: string) => {
    const res = await api.get(`/messages/${conversationId}`);
    return res.data;
  },

  send: async (conversationId: string, text: string, messageType: string = 'text') => {
    const res = await api.post('/messages', {
      conversationId,
      text,
      messageType
    });
    return res.data;
  },

  search: async (conversationId: string, query: string) => {
    const res = await api.post('/messages/search', {
      conversationId,
      query
    });
    return res.data;
  },

  markAsRead: async (messageId: string) => {
    const res = await api.put(`/messages/${messageId}/read`);
    return res.data;
  },

  delete: async (messageId: string) => {
    const res = await api.delete(`/messages/${messageId}`);
    return res.data;
  }
};

/**
 * Status APIs
 */
export const statusAPI = {
  getAll: async () => {
    const res = await api.get('/status');
    return res.data;
  },

  getByUser: async (userId: string) => {
    const res = await api.get(`/status/${userId}`);
    return res.data;
  },

  create: async (statusType: string, mediaUrl?: string, textContent?: string, privacy: string = 'contacts') => {
    const res = await api.post('/status', {
      statusType,
      mediaUrl,
      textContent,
      privacy
    });
    return res.data;
  },

  markAsViewed: async (statusId: string) => {
    const res = await api.put(`/status/${statusId}/view`);
    return res.data;
  },

  delete: async (statusId: string) => {
    const res = await api.delete(`/status/${statusId}`);
    return res.data;
  }
};

/**
 * Call APIs
 */
export const callAPI = {
  getHistory: async () => {
    const res = await api.get('/calls/history');
    return res.data;
  },

  initiate: async (recipientId: string, callType: 'voice' | 'video', conversationId?: string) => {
    const res = await api.post('/calls/initiate', {
      recipientId,
      callType,
      conversationId
    });
    return res.data;
  },

  accept: async (callId: string) => {
    const res = await api.put(`/calls/${callId}/accept`);
    return res.data;
  },

  reject: async (callId: string) => {
    const res = await api.put(`/calls/${callId}/reject`);
    return res.data;
  },

  end: async (callId: string, callQuality?: string) => {
    const res = await api.put(`/calls/${callId}/end`, { callQuality });
    return res.data;
  },

  markMissed: async (callId: string) => {
    const res = await api.put(`/calls/${callId}/missed`);
    return res.data;
  }
};

/**
 * User APIs
 */
export const userAPI = {
  getProfile: async (userId: string) => {
    const res = await api.get(`/users/${userId}`);
    return res.data;
  },

  updateProfile: async (displayName?: string, about?: string, avatarUrl?: string) => {
    const res = await api.put('/users/profile', {
      displayName,
      about,
      avatarUrl
    });
    return res.data;
  },

  search: async (query: string) => {
    const res = await api.get(`/users/search?q=${query}`);
    return res.data;
  }
};

export default api;
