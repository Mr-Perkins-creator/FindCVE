-- ----------------------------
-- Таблица пользователей бота
-- ----------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables 
                   WHERE table_schema = 'public' AND table_name = 'bot_users') THEN
        CREATE TABLE bot_users (
            user_id BIGINT PRIMARY KEY,
            username TEXT,
            first_name TEXT,
            last_name TEXT,
            notifications_enabled BOOLEAN DEFAULT TRUE
        );
    END IF;
END$$;

-- ----------------------------
-- Таблица уязвимостей
-- ----------------------------
CREATE TABLE IF NOT EXISTS vulnerabilities (
    id SERIAL PRIMARY KEY,
    cve_id TEXT UNIQUE NOT NULL,
    description TEXT,
    published_at TIMESTAMP,
    updated_at TIMESTAMP,
    cvss_v3_score NUMERIC,
    cvss_v3_severity TEXT,
    cvss_v3_vector TEXT,
    cvss_v2_score NUMERIC,
    cvss_v2_severity TEXT,
    cvss_v2_vector TEXT,
    has_poc BOOLEAN DEFAULT FALSE,
    poc_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    modified_at TIMESTAMP DEFAULT NOW()
);

-- ----------------------------
-- Таблица CWE
-- ----------------------------
CREATE TABLE IF NOT EXISTS cwe (
    id SERIAL PRIMARY KEY,
    cwe_id TEXT UNIQUE NOT NULL,
    name TEXT
);

-- ----------------------------
-- Связь CVE ↔ CWE
-- ----------------------------
CREATE TABLE IF NOT EXISTS vulnerability_cwe (
    vuln_id INT REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    cwe_id INT REFERENCES cwe(id) ON DELETE CASCADE,
    PRIMARY KEY (vuln_id, cwe_id)
);

-- ----------------------------
-- Таблица CPE (продукты/версии)
-- ----------------------------
CREATE TABLE IF NOT EXISTS cpe (
    id SERIAL PRIMARY KEY,
    vuln_id INT REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    vendor TEXT,
    product TEXT,
    version TEXT
);

-- ----------------------------
-- References (ссылки)
-- ----------------------------
CREATE TABLE IF NOT EXISTS vuln_references (
    id SERIAL PRIMARY KEY,
    vuln_id INT REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    url TEXT,
    source TEXT,
    tags TEXT[]
);

-- ----------------------------
-- PoC references (Proof of Concept)
-- ----------------------------
CREATE TABLE IF NOT EXISTS poc_references (
    id SERIAL PRIMARY KEY,
    vuln_id INT REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    url TEXT,
    kind TEXT,  -- repo/file
    stars INT,
    last_commit_at TIMESTAMP
);

-- ----------------------------
-- Affected projects (GitHub репозитории с потенциально уязвимыми версиями)
-- ----------------------------
CREATE TABLE IF NOT EXISTS affected_projects (
    id SERIAL PRIMARY KEY,
    vuln_id INT REFERENCES vulnerabilities(id) ON DELETE CASCADE,
    repo_full_name TEXT,
    html_url TEXT,
    language TEXT,
    evidence TEXT,
    matched_version TEXT,
    found_at TIMESTAMP DEFAULT NOW()
);

-- ----------------------------
-- Индексы для ускорения запросов
-- ----------------------------
CREATE INDEX IF NOT EXISTS idx_vuln_cve_id ON vulnerabilities(cve_id);
CREATE INDEX IF NOT EXISTS idx_vuln_severity ON vulnerabilities(cvss_v3_severity);
CREATE INDEX IF NOT EXISTS idx_cpe_vendor_product_version ON cpe(vendor, product, version);
CREATE INDEX IF NOT EXISTS idx_poc_vuln_id ON poc_references(vuln_id);
CREATE INDEX IF NOT EXISTS idx_affected_vuln_id ON affected_projects(vuln_id);
