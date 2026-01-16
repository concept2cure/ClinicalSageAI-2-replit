import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export const DeficiencyBank = {
  async upload(sourceSystem: string, rawContent: string, meta: any = {}) {
    if (!supabase) {
      console.error('[DeficiencyBank] Supabase not configured');
      return { status: 'error', error: 'Supabase not configured' };
    }

    const hash = crypto.createHash('sha256').update(rawContent).digest('hex');

    const { error } = await supabase
      .from('deficiency_bank')
      .upsert(
        {
          fingerprint: hash,
          source_system: sourceSystem,
          content: rawContent,
          insight: meta.insight || null,
          tags: meta.tags || [],
          severity: meta.severity || 'LOW',
          created_at: new Date().toISOString(),
          is_verified: true,
        },
        { onConflict: 'fingerprint' }
      );

    if (error) console.error('[DeficiencyBank] Storage Error:', error.message);
    return { status: error ? 'error' : 'success' };
  },

  async query(params: { topic: string }) {
    if (!supabase) {
      return { count: 0, insights: ['Supabase not configured.'], examples: [] };
    }

    const topic = String(params.topic || '').trim();
    if (!topic) {
      return { count: 0, insights: ['Provide a topic to search the Deficiency Bank.'], examples: [] };
    }

    const { data, error } = await supabase
      .from('deficiency_bank')
      .select('content, insight, tags, severity')
      .ilike('content', `%${topic}%`)
      .limit(10);

    if (error) {
      console.error('[DeficiencyBank] Query Error:', error.message);
      return { count: 0, insights: ['Query failed.'], examples: [] };
    }

    const examples = (data || []).map(row => row.content).slice(0, 3);
    return {
      count: data?.length || 0,
      insights: data?.length ? [`Found ${data.length} matching deficiency record(s).`] : ['No matches found.'],
      examples,
    };
  },

  /**
   * Returns real-time metrics of the intelligence asset.
   */
  async getStats() {
    if (!supabase) {
      console.error('[DeficiencyBank] Supabase not configured');
      return { total: 0, sources: {}, last_updated: new Date().toISOString() };
    }

    const { count, error } = await supabase
      .from('deficiency_bank')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[DeficiencyBank] Stats Error:', error);
      return { total: 0, sources: {}, last_updated: new Date().toISOString() };
    }

    const { data: sources, error: sourcesError } = await supabase
      .from('deficiency_bank')
      .select('source_system');

    if (sourcesError) {
      console.error('[DeficiencyBank] Source Breakdown Error:', sourcesError);
    }

    const breakdown = (sources || []).reduce((acc: Record<string, number>, curr: any) => {
      const key = curr?.source_system || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      total: count || 0,
      sources: breakdown,
      last_updated: new Date().toISOString(),
    };
  },

  async getStream(limit = 25) {
    if (!supabase) {
      console.error('[DeficiencyBank] Supabase not configured');
      return [];
    }

    const { data, error } = await supabase
      .from('deficiency_bank')
      .select('id, source_system, insight, severity, created_at, tags')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[DeficiencyBank] Stream Error:', error);
      return [];
    }

    return data || [];
  },
};
