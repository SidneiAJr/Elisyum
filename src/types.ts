// ============================================
// 🏛️ ELISIUM — Types
// ============================================

export interface EliasiumOptions {
    cerberus?:     CerberusOptions;
    caronte?:      CaronteOptions;
    nemesis?:      NemesisOptions;
    hidra?:        HidraOptions;
    atlas?:        AtlasOptions;
    inteligencia?: InteligenciaOptions;
    morfeu?:       MorfeuOptions;
    tartaro?:      'memory' | 'redis';
}

// ⚔️ Cérbero — whitelist / blacklist / ban
export interface CerberusOptions {
    whitelist?:  string[];
    blacklist?:  string[];
    banTime?:    number;   
    maxStrikes?: number; 
    trustedProxies?: string[];  
}

// 🌊 Caronte — rate limit
export interface CaronteOptions {
    windowMs?: number;  // default 60s
    max?:      number;  // default 100 req/window
}

// 🛡️ Némesis — WAF
export interface NemesisOptions {
    xss?:              boolean;
    sqlInjection?:     boolean;
    commandInjection?: boolean;
    headerInjection?:  boolean;
}

// 🐍 Hidra — Slowloris + Request Smuggling
export interface HidraOptions {
    slowloris?:         boolean;
    requestSmuggling?:  boolean;
    connectionTimeout?: number;  // ms — default 5000
    maxHeaderSize?:     number;  // bytes — default 8192
}

// 🌍 Atlas — HTTP/HTTPS
export interface AtlasOptions {
    httpsOnly?:    boolean;  // rejeita HTTP — default false
    penalizeHttp?: boolean;  // adiciona score — default true
}

// 🧠 Inteligência — score heurístico
export interface InteligenciaOptions {
    enabled?:           boolean;  // default true
    banScoreThreshold?: number;   // 0-100, default 80
}

// 🌙 Morfeu — callbacks e alertas
export interface MorfeuOptions {
    onBan?: (ip: string, motivo: string, hash: string) => void;
    telegram?: {
        token:  string;
        chatId: string;
    };
}

// 🗄️ IPRecord — estado de cada IP no store
export interface IPRecord {
    requests:     number;
    strikes:      number;
    bannedUntil:  number | null;
    firstRequest: number;
    lastRequest:  number;
    score:        number;
}