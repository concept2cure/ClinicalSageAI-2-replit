-- ============================================================================
-- Research Committee Governance — IACUC / IRB / IBC (Capability C2C-16)
-- ============================================================================
--
-- The committee layer the protocol modules lacked: standing committee membership
-- with stakeholder roles, convened meetings with quorum, agenda items (one per
-- protocol under review), attendance, and per-member polling/voting that resolves
-- to a recorded determination. Role-specific privileges are enforced through the
-- platform RBAC engine (can()/whoCan()); finalize additionally requires current
-- CITI training.
--
-- Grounded in PHS Policy IV.A/IV.C + AWA 9 CFR 2.31 (IACUC composition, quorum,
-- majority vote) and the revised Common Rule 45 CFR 46.107-46.108 (IRB
-- composition: a nonscientist + a non-affiliated member; quorum = majority of
-- members; approval = majority of members present). CHECK-constrained enums.
--
-- Schema:  shared/schema/research-committees.ts
-- Service: server/services/committees/*
-- Routes:  server/routes/committees.ts (/api/committees)
-- ============================================================================

-- ─── Committee members ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS committee_members (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  committee_type  text NOT NULL CHECK (committee_type IN ('iacuc','irb','ibc')),
  user_id         integer REFERENCES users(id),
  personnel_id    integer REFERENCES research_personnel(id),
  member_name     text NOT NULL,
  role            text NOT NULL DEFAULT 'member'
                    CHECK (role IN ('chair','vice_chair','member','veterinarian','nonscientist','community_member','coordinator','administrator')),
  voting_member   boolean NOT NULL DEFAULT true,
  scientist       boolean NOT NULL DEFAULT true,
  affiliated      boolean NOT NULL DEFAULT true,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  start_date      date,
  end_date        date,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_committee_members_org       ON committee_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_committee_members_committee ON committee_members(organization_id, committee_type);

-- ─── Committee meetings ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS committee_meetings (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  committee_type   text NOT NULL CHECK (committee_type IN ('iacuc','irb','ibc')),
  title            text NOT NULL,
  meeting_date     date,
  status           text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','convened','adjourned','cancelled')),
  quorum_required  integer,
  members_convened integer NOT NULL DEFAULT 0,
  quorum_met       boolean NOT NULL DEFAULT false,
  convened_at      timestamptz,
  adjourned_at     timestamptz,
  created_by       integer NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_committee_meetings_org       ON committee_meetings(organization_id);
CREATE INDEX IF NOT EXISTS idx_committee_meetings_committee ON committee_meetings(organization_id, committee_type);

-- ─── Attendance ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS committee_attendance (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  meeting_id      integer NOT NULL REFERENCES committee_meetings(id),
  member_id       integer NOT NULL REFERENCES committee_members(id),
  present         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_committee_attendance_org ON committee_attendance(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_committee_attendance_meeting_member ON committee_attendance(meeting_id, member_id);

-- ─── Agenda items ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS committee_agenda_items (
  id                      serial PRIMARY KEY,
  organization_id         integer NOT NULL REFERENCES organizations(id),
  meeting_id              integer NOT NULL REFERENCES committee_meetings(id),
  committee_type          text NOT NULL CHECK (committee_type IN ('iacuc','irb','ibc')),
  protocol_kind           text NOT NULL CHECK (protocol_kind IN ('iacuc_protocol','irb_submission')),
  protocol_id             integer NOT NULL,
  title                   text NOT NULL,
  review_type             text,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','under_discussion','voted','deferred','tabled')),
  outcome                 text CHECK (outcome IN ('approved','approved_with_modifications','disapproved','tabled')),
  determination_rationale text,
  finalized_by            integer REFERENCES users(id),
  finalized_at            timestamptz,
  created_by              integer NOT NULL REFERENCES users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz
);
CREATE INDEX IF NOT EXISTS idx_committee_agenda_org     ON committee_agenda_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_committee_agenda_meeting ON committee_agenda_items(meeting_id);

-- ─── Votes (the poll) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS committee_votes (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  agenda_item_id  integer NOT NULL REFERENCES committee_agenda_items(id),
  member_id       integer NOT NULL REFERENCES committee_members(id),
  vote            text NOT NULL CHECK (vote IN ('approve','approve_with_modifications','disapprove','abstain','recuse')),
  comment         text,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_committee_votes_org    ON committee_votes(organization_id);
CREATE INDEX IF NOT EXISTS idx_committee_votes_agenda ON committee_votes(agenda_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_committee_votes_agenda_member ON committee_votes(agenda_item_id, member_id);
