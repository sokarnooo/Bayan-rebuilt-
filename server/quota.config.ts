/**
 * server/quota.config.ts — Rate Limiting & Quota Management for Bayan
 *
 * Evenly spreads Google AI Studio free tier limits across 24 Pacific clock hours.
 * Uses process.env.GEMINI_API_KEY server-side only with optional user BYOK bypass.
 */

export const SAFETY_FACTOR = 0.8;

export interface ModelQuotaConfig {
  id: string;
  name: string;
  rpd: number;
  hourlyBudget: number;
}

// Configured model pool with AI Studio free-tier RPDs
export const MODEL_CONFIGS: Record<string, ModelQuotaConfig> = {
  'gemini-2.5-flash-lite': {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite',
    rpd: 500,
    hourlyBudget: Math.floor((500 * SAFETY_FACTOR) / 24), // 16 req/hr
  },
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    rpd: 1500,
    hourlyBudget: Math.floor((1500 * SAFETY_FACTOR) / 24), // 50 req/hr
  },
  'gemma-2-27b-it': {
    id: 'gemma-2-27b-it',
    name: 'Gemma 2 27B',
    rpd: 14400,
    hourlyBudget: Math.floor((14400 * SAFETY_FACTOR) / 24), // 480 req/hr
  },
};

// Failover chains per action
export const ACTION_CHAINS: Record<string, string[]> = {
  ocr: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  ask_call1: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
  ask_call2: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'],
};

export type ActionType = 'ocr' | 'ask_call1' | 'ask_call2';

interface HourBucket {
  hourKey: string;
  remaining: number;
  totalBudget: number;
  unavailableUntilNextHour: boolean;
}

interface IpRecord {
  hourKey: string;
  count: number;
  minuteWindowStart: number;
  minuteCount: number;
}

class QuotaManager {
  private buckets: Map<string, HourBucket> = new Map(); // key: `${modelId}_${hourKey}`
  private ipRecords: Map<string, IpRecord> = new Map();
  private isInitialStartup = true;
  private actionCounters: Record<ActionType, number> = {
    ocr: 0,
    ask_call1: 0,
    ask_call2: 0,
  };
  private customHourlyBudgets: Record<string, number> | null = null;

  // Set custom hourly budgets for testing
  setTestBudgets(budget: number | null) {
    if (budget === null) {
      this.customHourlyBudgets = null;
    } else {
      this.customHourlyBudgets = {};
      for (const key of Object.keys(MODEL_CONFIGS)) {
        this.customHourlyBudgets[key] = budget;
      }
    }
    this.buckets.clear();
    this.ipRecords.clear();
  }

  // Get current Pacific clock hour key (America/Los_Angeles)
  getPacificHourKey(): string {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    });
    return formatter.format(new Date()).replace(/[\/,\s:]+/g, '-');
  }

  getMinutesToNextPacificHour(): number {
    const now = new Date();
    const mins = now.getMinutes();
    return Math.max(1, 60 - mins);
  }

  getRetryAfterSeconds(): number {
    const now = new Date();
    const mins = now.getMinutes();
    const secs = now.getSeconds();
    return Math.max(1, (60 - mins) * 60 - secs);
  }

  private getModelHourlyBudget(modelId: string): number {
    if (this.customHourlyBudgets && this.customHourlyBudgets[modelId] !== undefined) {
      return this.customHourlyBudgets[modelId];
    }
    return MODEL_CONFIGS[modelId]?.hourlyBudget || 16;
  }

  private getBucket(modelId: string, hourKey: string): HourBucket {
    const bucketKey = `${modelId}_${hourKey}`;
    let b = this.buckets.get(bucketKey);
    if (!b) {
      const budget = this.getModelHourlyBudget(modelId);
      // On fresh server restart, start the first hour at 50% capacity; for custom test budgets start at exact budget
      const initialRemaining =
        this.customHourlyBudgets === null && this.isInitialStartup
          ? Math.floor(budget * 0.5)
          : budget;
      b = {
        hourKey,
        remaining: initialRemaining,
        totalBudget: budget,
        unavailableUntilNextHour: false,
      };
      this.buckets.set(bucketKey, b);
    }
    return b;
  }

  getTotalRemainingForAction(action: ActionType): number {
    const hourKey = this.getPacificHourKey();
    const chain = ACTION_CHAINS[action] || [];
    let total = 0;
    for (const model of chain) {
      const b = this.getBucket(model, hourKey);
      if (!b.unavailableUntilNextHour) {
        total += b.remaining;
      }
    }
    return total;
  }

  // Check IP rate limits
  checkIpLimit(ip: string): { allowed: boolean; retryAfterSeconds: number; reason?: string } {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
      // Local development / internal test
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const hourKey = this.getPacificHourKey();
    const now = Date.now();

    // Total hourly budget across all models
    let totalBudget = 0;
    for (const model of Object.keys(MODEL_CONFIGS)) {
      totalBudget += this.getModelHourlyBudget(model);
    }
    const perIpHourlyCap = Math.max(2, Math.floor(0.2 * totalBudget));

    let record = this.ipRecords.get(ip);
    if (!record || record.hourKey !== hourKey) {
      record = {
        hourKey,
        count: 0,
        minuteWindowStart: now,
        minuteCount: 0,
      };
      this.ipRecords.set(ip, record);
    }

    // Minute guard (max 10 requests per minute)
    if (now - record.minuteWindowStart > 60000) {
      record.minuteWindowStart = now;
      record.minuteCount = 0;
    }
    if (record.minuteCount >= 10) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, 60 - Math.floor((now - record.minuteWindowStart) / 1000)),
        reason: 'PER_MINUTE_LIMIT',
      };
    }

    // Hourly cap
    if (record.count >= perIpHourlyCap) {
      return {
        allowed: false,
        retryAfterSeconds: this.getRetryAfterSeconds(),
        reason: 'PER_HOUR_IP_CAP',
      };
    }

    return { allowed: true, retryAfterSeconds: 0 };
  }

  recordIpUsage(ip: string) {
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return;
    const hourKey = this.getPacificHourKey();
    let record = this.ipRecords.get(ip);
    if (!record || record.hourKey !== hourKey) {
      record = {
        hourKey,
        count: 0,
        minuteWindowStart: Date.now(),
        minuteCount: 0,
      };
      this.ipRecords.set(ip, record);
    }
    record.count++;
    record.minuteCount++;
  }

  // Spend priority helper: Call 1 is skipped if primary model is < 50% capacity
  shouldSkipCall1(): boolean {
    const hourKey = this.getPacificHourKey();
    const primaryModel = ACTION_CHAINS.ask_call1[0];
    const b = this.getBucket(primaryModel, hourKey);
    return b.remaining < Math.floor(b.totalBudget * 0.5);
  }

  // Select available model in chain and deduct 1 quota unit
  acquireModel(action: ActionType): { model: string | null; retryAfterSeconds: number } {
    const hourKey = this.getPacificHourKey();
    this.isInitialStartup = false;
    const chain = ACTION_CHAINS[action] || [];

    for (const modelId of chain) {
      const bucket = this.getBucket(modelId, hourKey);
      if (!bucket.unavailableUntilNextHour && bucket.remaining > 0) {
        bucket.remaining--;
        this.actionCounters[action]++;
        return { model: modelId, retryAfterSeconds: 0 };
      }
    }

    return { model: null, retryAfterSeconds: this.getRetryAfterSeconds() };
  }

  // Mark model unavailable on upstream 429/503 from Google
  markModelUnavailable(modelId: string) {
    const hourKey = this.getPacificHourKey();
    const bucket = this.getBucket(modelId, hourKey);
    bucket.unavailableUntilNextHour = true;
    bucket.remaining = 0;
  }

  // Generate standard localized quota notice banner
  getQuotaNotice(lang: 'ar' | 'en' = 'ar'): string {
    const minutes = this.getMinutesToNextPacificHour();
    if (lang === 'en') {
      return `AI quota for this hour has been consumed and resets in ${minutes} minutes. Scripture search and Ask retrieval work without automated summaries; you can also enter your own API key in Settings.`;
    }
    return `استُهلكت حصة الذكاء الاصطناعي لهذه الساعة وتتجدد بعد ${minutes} دقيقة. البحث في المصحف والحديث والبحث بالأسئلة يعمل دون ملخص آلي، ويمكنك إدخال مفتاحك الخاص من الإعدادات.`;
  }

  // Stats for reporting
  getReportStats() {
    const hourKey = this.getPacificHourKey();
    return {
      hourKey,
      actionCounters: { ...this.actionCounters },
      minutesRemainingInHour: this.getMinutesToNextPacificHour(),
      retryAfterSeconds: this.getRetryAfterSeconds(),
      models: Object.keys(MODEL_CONFIGS).map((m) => {
        const b = this.getBucket(m, hourKey);
        return {
          model: m,
          rpd: MODEL_CONFIGS[m].rpd,
          hourlyBudget: b.totalBudget,
          remaining: b.remaining,
          unavailable: b.unavailableUntilNextHour,
        };
      }),
    };
  }
}

export const quotaManager = new QuotaManager();
