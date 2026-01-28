import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Use service key for server-side operations

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Create Supabase client with service role key (bypasses RLS)
export const supabase = createClient(supabaseUrl, supabaseKey);

// Database helper functions
export const db = {
  // User operations
  async getUserById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }
    return data;
  },

  async getUserByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }
    return data;
  },

  async getUserByProviderId(provider, providerId) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('provider', provider)
      .eq('provider_id', providerId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }
    return data;
  },

  async createUser(userData) {
    const { data, error } = await supabase
      .from('users')
      .insert(userData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateUser(userId, updates) {
    const { data, error } = await supabase
      .from('users')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Subscription operations
  async getSubscriptionByUserId(userId) {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  async createSubscription(subscriptionData) {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert(subscriptionData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateSubscription(subscriptionId, updates) {
    const { data, error } = await supabase
      .from('subscriptions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // Usage tracking
  async logUsage(usageData) {
    const { data, error } = await supabase
      .from('usage_logs')
      .insert(usageData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async getDailyUsage(userId) {
    const today = new Date().toISOString().split('T')[0];
    const { count, error } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('success', true)
      .gte('created_at', today);
    
    if (error) throw error;
    return count || 0;
  },

  async getMonthlyUsage(userId) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const { count, error } = await supabase
      .from('usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('success', true)
      .gte('created_at', startOfMonth.toISOString());
    
    if (error) throw error;
    return count || 0;
  },

  // Quota operations
  async getOrCreateQuota(userId) {
    let { data, error } = await supabase
      .from('user_quotas')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // Create quota if doesn't exist
      const { data: newQuota, error: createError } = await supabase
        .from('user_quotas')
        .insert({ user_id: userId })
        .select()
        .single();
      
      if (createError) throw createError;
      return newQuota;
    }
    
    if (error) throw error;
    
    // Reset daily quota if needed
    const today = new Date().toISOString().split('T')[0];
    if (data.reset_date < today) {
      const { data: updated, error: updateError } = await supabase
        .from('user_quotas')
        .update({
          daily_operations: 0,
          last_reset_date: today,
          reset_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        })
        .eq('user_id', userId)
        .select()
        .single();
      
      if (updateError) throw updateError;
      return updated;
    }
    
    return data;
  },

  async incrementQuota(userId) {
    const { data, error } = await supabase.rpc('increment_user_quota', {
      p_user_id: userId
    });
    
    if (error) {
      // Fallback if RPC doesn't exist
      const quota = await this.getOrCreateQuota(userId);
      const { data: updated, error: updateError } = await supabase
        .from('user_quotas')
        .update({
          daily_operations: quota.daily_operations + 1,
          monthly_operations: quota.monthly_operations + 1
        })
        .eq('user_id', userId)
        .select()
        .single();
      
      if (updateError) throw updateError;
      return updated;
    }
    
    return data;
  },

  // Transaction operations
  async createTransaction(transactionData) {
    const { data, error } = await supabase
      .from('transactions')
      .insert(transactionData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async updateTransaction(transactionId, updates) {
    const { data, error } = await supabase
      .from('transactions')
      .update(updates)
      .eq('id', transactionId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // File metadata operations
  async saveFileMetadata(fileData) {
    const { data, error } = await supabase
      .from('file_metadata')
      .insert(fileData)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async deleteExpiredFiles() {
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('file_metadata')
      .delete()
      .lt('expires_at', now)
      .select();
    
    if (error) throw error;
    return data;
  }
};

export default db;
