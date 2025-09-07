export interface User {
  id: string;
  username?: string; // Optional for Google OAuth users
  email: string;
  name?: string; // Google OAuth display name
  avatar?: string; // Google OAuth profile picture
  role: 'user' | 'admin';
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
}

export interface Url {
  id: string;
  shortId: string;
  customAlias?: string;
  originalUrl: string;
  shortUrl: string;
  clicks: number;
  createdAt: string;
  lastClicked?: string;
  expiresAt?: string;
  isExpired: boolean;
  password?: string;
  tags?: string[];
  isActive: boolean;
  user?: User;
}

export interface VisitLog {
  timestamp: string;
  ip: string;
  userAgent: string;
  referrer?: string;
  device?: string;
  country?: string;
  city?: string;
  browser?: string;
  os?: string;
}

export interface Analytics {
  originalUrl: string;
  shortUrl: string;
  customAlias?: string;
  totalClicks: number;
  createdAt: string;
  lastClicked?: string;
  expiresAt?: string;
  isExpired: boolean;
  visitLogs: VisitLog[];
}

export interface CreateUrlData {
  originalUrl: string;
  customAlias?: string;
  expiresAt?: string;
  password?: string;
  tags?: string[];
}

export interface UpdateUrlData {
  customAlias?: string;
  expiresAt?: string;
  password?: string;
  tags?: string[];
  isActive?: boolean;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
  pagination?: Pagination;
}

export interface AuthResponse {
  token: string;
  user: User;
  message: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface SignupData {
  username: string;
  email: string;
  password: string;
}
