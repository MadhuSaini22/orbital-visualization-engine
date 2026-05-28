create table if not exists satellites (
  norad_id integer primary key,
  name text not null,
  object_type text,
  owner text,
  source text not null default 'unknown',
  updated_at timestamptz not null default now()
);

create table if not exists orbit_elements (
  id text primary key,
  norad_id integer not null references satellites(norad_id) on delete cascade,
  format text not null,
  epoch timestamptz,
  raw_payload jsonb not null,
  ingested_at timestamptz not null default now()
);

create index if not exists orbit_elements_norad_epoch_idx
  on orbit_elements(norad_id, epoch desc);

create table if not exists catalog_memberships (
  group_id text not null,
  norad_id integer not null references satellites(norad_id) on delete cascade,
  refreshed_at timestamptz not null default now(),
  primary key (group_id, norad_id)
);

create index if not exists catalog_memberships_group_idx
  on catalog_memberships(group_id, refreshed_at desc);

create table if not exists satellite_analysis_configs (
  norad_id integer primary key references satellites(norad_id) on delete cascade,
  preset text not null default 'FAST_PREVIEW',
  propagator_type text not null default 'TLE_SGP4',
  gravity_enabled boolean not null default false,
  gravity_degree integer not null default 2,
  gravity_order integer not null default 0,
  drag_enabled boolean not null default false,
  solar_radiation_pressure_enabled boolean not null default false,
  third_body_sun_enabled boolean not null default false,
  third_body_moon_enabled boolean not null default false,
  maneuver_model_enabled boolean not null default false,
  dry_mass_kg double precision not null default 850.0,
  fuel_mass_kg double precision not null default 150.0,
  drag_area_m2 double precision not null default 20.0,
  drag_coefficient double precision not null default 2.2,
  srp_area_m2 double precision not null default 15.0,
  reflectivity_coefficient double precision not null default 1.2,
  nominal_thrust_n double precision not null default 0.2,
  nominal_isp_s double precision not null default 220.0,
  notes text,
  updated_at timestamptz not null default now()
);

alter table satellite_analysis_configs
  add column if not exists dry_mass_kg double precision not null default 850.0,
  add column if not exists fuel_mass_kg double precision not null default 150.0,
  add column if not exists drag_area_m2 double precision not null default 20.0,
  add column if not exists drag_coefficient double precision not null default 2.2,
  add column if not exists srp_area_m2 double precision not null default 15.0,
  add column if not exists reflectivity_coefficient double precision not null default 1.2,
  add column if not exists nominal_thrust_n double precision not null default 0.2,
  add column if not exists nominal_isp_s double precision not null default 220.0;

create table if not exists ephemeris_states (
  id text primary key,
  norad_id integer not null references satellites(norad_id) on delete cascade,
  state_time timestamptz not null,
  frame text not null,
  x_km double precision not null,
  y_km double precision not null,
  z_km double precision not null,
  vx_kmps double precision not null,
  vy_kmps double precision not null,
  vz_kmps double precision not null,
  latitude_deg double precision,
  longitude_deg double precision,
  altitude_km double precision
);

create index if not exists ephemeris_states_sat_time_idx
  on ephemeris_states(norad_id, state_time);

create table if not exists maneuvers (
  id text primary key,
  norad_id integer not null references satellites(norad_id) on delete cascade,
  name text not null,
  status text not null,
  event_time timestamptz not null,
  delta_v_mps double precision not null,
  duration_sec integer not null,
  frame text not null,
  vector jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists maneuvers_sat_time_idx
  on maneuvers(norad_id, event_time);

create table if not exists conjunctions (
  id text primary key,
  sat1_norad_id integer,
  sat2_norad_id integer,
  sat1_name text,
  sat2_name text,
  created_at timestamptz,
  tca timestamptz not null,
  miss_distance_km double precision,
  probability_of_collision double precision,
  relative_velocity_kmps double precision,
  risk text not null,
  source text not null default 'space-track',
  raw_cdm jsonb not null
);

create index if not exists conjunctions_tca_idx
  on conjunctions(tca);

create index if not exists conjunctions_sat1_idx
  on conjunctions(sat1_norad_id);

create index if not exists conjunctions_sat2_idx
  on conjunctions(sat2_norad_id);
