export const schema = `
CREATE TABLE IF NOT EXISTS migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS entities (
 tenant text NOT NULL, kind text NOT NULL, id text NOT NULL, project_id text,
 data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,kind,id)
);
CREATE INDEX IF NOT EXISTS entities_project ON entities(tenant,kind,project_id);
CREATE TABLE IF NOT EXISTS credentials (
 token_hash text PRIMARY KEY, tenant text NOT NULL, actor_id text NOT NULL, role text NOT NULL,
 projects jsonb NOT NULL DEFAULT '[]', revoked boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS source_events (
 tenant text NOT NULL, provider text NOT NULL, delivery_id text NOT NULL, payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
 received_at timestamptz NOT NULL DEFAULT now(), error text, PRIMARY KEY(tenant,provider,delivery_id)
);
CREATE TABLE IF NOT EXISTS source_documents (
 id text NOT NULL, tenant text NOT NULL, project_id text NOT NULL, provider text NOT NULL, source_key text NOT NULL,
 revision text NOT NULL, source_time timestamptz NOT NULL, text text NOT NULL, url text NOT NULL,
 visibility text NOT NULL DEFAULT 'team', deleted boolean NOT NULL DEFAULT false, confirmed boolean NOT NULL DEFAULT false,
 metadata jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(),
 search tsvector GENERATED ALWAYS AS (to_tsvector('english',text)) STORED,
 PRIMARY KEY(tenant,id), UNIQUE(tenant,provider,source_key)
);
CREATE INDEX IF NOT EXISTS documents_search ON source_documents USING gin(search);
CREATE INDEX IF NOT EXISTS documents_project ON source_documents(tenant,project_id,source_time);
CREATE TABLE IF NOT EXISTS source_revisions (
 tenant text NOT NULL, document_id text NOT NULL, revision text NOT NULL, content_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,document_id,revision)
);
CREATE TABLE IF NOT EXISTS jobs (
 id text NOT NULL, tenant text NOT NULL, project_id text NOT NULL, plan_id text, kind text NOT NULL,
 state text NOT NULL DEFAULT 'queued', runner_id text, fence integer NOT NULL DEFAULT 0, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0, data jsonb NOT NULL DEFAULT '{}', action_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id), UNIQUE(tenant,action_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_repo ON jobs(tenant,project_id)
 WHERE state IN ('leased','preparing','running','verifying');
CREATE TABLE IF NOT EXISTS job_events (
 tenant text NOT NULL, job_id text NOT NULL, sequence integer NOT NULL, fence integer NOT NULL,
 event jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,job_id,sequence)
);
CREATE TABLE IF NOT EXISTS approvals (
 tenant text NOT NULL, id text NOT NULL, project_id text NOT NULL, plan_id text NOT NULL,
 plan_digest text NOT NULL, base_sha text NOT NULL, policy_version integer NOT NULL, actor_id text NOT NULL,
 nonce_hash text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
 decision text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant,id)
);
CREATE TABLE IF NOT EXISTS outbox (
 tenant text NOT NULL, id text NOT NULL, project_id text NOT NULL, kind text NOT NULL, action_key text NOT NULL,
 data jsonb NOT NULL, state text NOT NULL DEFAULT 'queued', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), error text, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant,id), UNIQUE(tenant,action_key)
);
CREATE TABLE IF NOT EXISTS audit_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant text NOT NULL, actor_id text NOT NULL,
 action text NOT NULL, target text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS model_usage (
 tenant text NOT NULL, day date NOT NULL DEFAULT CURRENT_DATE, calls integer NOT NULL DEFAULT 0,
 input_tokens bigint NOT NULL DEFAULT 0, output_tokens bigint NOT NULL DEFAULT 0, PRIMARY KEY(tenant,day)
);
INSERT INTO migrations(version) VALUES(1) ON CONFLICT DO NOTHING;
`;
