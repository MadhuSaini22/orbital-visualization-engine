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

create table if not exists manual_orbits (
  id text primary key,
  name text not null,
  type text not null,
  epoch timestamptz,
  frame text not null,
  central_body text not null default 'EARTH',
  payload jsonb not null,
  propagator_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists manual_orbits_updated_idx
  on manual_orbits(updated_at desc);

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

create table if not exists propagation_profiles (
  id text primary key,
  owner_type text not null,
  owner_id text not null,
  name text not null,
  preset text not null default 'FAST_PREVIEW',
  propagator_type text not null default 'NUMERICAL',
  gravity_enabled boolean not null default false,
  gravity_degree integer not null default 2,
  gravity_order integer not null default 0,
  drag_enabled boolean not null default false,
  solar_radiation_pressure_enabled boolean not null default false,
  third_body_sun_enabled boolean not null default false,
  third_body_moon_enabled boolean not null default false,
  maneuver_model_enabled boolean not null default true,
  integrator_type text not null default 'DORMAND_PRINCE_853',
  dry_mass_kg double precision not null default 850.0,
  fuel_mass_kg double precision not null default 150.0,
  drag_area_m2 double precision not null default 20.0,
  drag_coefficient double precision not null default 2.2,
  srp_area_m2 double precision not null default 15.0,
  reflectivity_coefficient double precision not null default 1.2,
  nominal_thrust_n double precision not null default 0.2,
  nominal_isp_s double precision not null default 220.0,
  integrator_min_step double precision not null default 0.1,
  integrator_max_step double precision not null default 120.0,
  integrator_abs_tol double precision not null default 1.0,
  integrator_rel_tol double precision not null default 1.0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint propagation_profiles_owner_type_valid check (owner_type in ('SATELLITE', 'MANUAL_ORBIT', 'MISSION')),
  constraint propagation_profiles_propagator_type_valid check (propagator_type in ('TLE_SGP4', 'KEPLERIAN', 'NUMERICAL')),
  constraint propagation_profiles_integrator_type_valid check (integrator_type in ('DORMAND_PRINCE_853', 'DORMAND_PRINCE_54', 'CLASSICAL_RUNGE_KUTTA', 'GILL', 'LUTHER', 'MIDPOINT', 'THREE_EIGHTHES', 'ADAMS_BASHFORTH', 'ADAMS_MOULTON', 'GRAGG_BULIRSCH_STOER')),
  constraint propagation_profiles_gravity_degree_valid check (gravity_degree >= 2),
  constraint propagation_profiles_gravity_order_valid check (gravity_order >= 0 and gravity_order <= gravity_degree),
  constraint propagation_profiles_mass_valid check (dry_mass_kg >= 0 and fuel_mass_kg >= 0),
  constraint propagation_profiles_area_valid check (drag_area_m2 >= 0 and srp_area_m2 >= 0),
  constraint propagation_profiles_coefficients_valid check (drag_coefficient >= 0 and reflectivity_coefficient >= 0),
  constraint propagation_profiles_maneuver_defaults_valid check (nominal_thrust_n >= 0 and nominal_isp_s >= 0),
  constraint propagation_profiles_integrator_valid check (integrator_min_step > 0 and integrator_max_step >= integrator_min_step and integrator_abs_tol > 0 and integrator_rel_tol > 0)
);

create unique index if not exists propagation_profiles_owner_unique
  on propagation_profiles(owner_type, owner_id);

create index if not exists propagation_profiles_updated_idx
  on propagation_profiles(updated_at desc);

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

create table if not exists missions (
  id text primary key,
  name text not null,
  subject_norad_id integer references satellites(norad_id) on delete restrict,
  subject_orbit_id text references manual_orbits(id) on delete restrict,
  propagator_type text not null,
  scenario_start timestamptz not null,
  scenario_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint missions_scenario_window_valid check (scenario_start < scenario_end),
  constraint missions_propagator_type_valid check (propagator_type in ('TLE_SGP4', 'KEPLERIAN', 'NUMERICAL'))
);

create index if not exists missions_updated_idx
  on missions(updated_at desc);

create table if not exists mission_timeline_events (
  id text primary key,
  mission_id text not null references missions(id) on delete cascade,
  sequence_index integer not null,
  type text not null,
  name text not null,
  enabled boolean not null default true,
  execution_time timestamptz not null,
  parameters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mission_timeline_sequence_nonnegative check (sequence_index >= 0),
  constraint mission_timeline_type_valid check (type in ('COAST', 'IMPULSIVE_BURN', 'VECTOR_BURN', 'FINITE_BURN', 'STATION_KEEPING', 'PLANE_CHANGE', 'HOHMANN_TRANSFER'))
);

create unique index if not exists mission_timeline_events_mission_sequence_unique
  on mission_timeline_events(mission_id, sequence_index);

create index if not exists mission_timeline_events_mission_time_idx
  on mission_timeline_events(mission_id, execution_time);

alter table missions
  add column if not exists subject_norad_id integer references satellites(norad_id) on delete restrict;

alter table missions
  add column if not exists subject_orbit_id text references manual_orbits(id) on delete restrict;

alter table missions
  drop constraint if exists missions_scenario_window_valid;

alter table missions
  add constraint missions_scenario_window_valid check (scenario_start < scenario_end);

alter table missions
  drop constraint if exists missions_propagator_type_valid;

alter table missions
  add constraint missions_propagator_type_valid check (propagator_type in ('TLE_SGP4', 'KEPLERIAN', 'NUMERICAL'));

alter table mission_timeline_events
  drop constraint if exists mission_timeline_sequence_nonnegative;

alter table mission_timeline_events
  add constraint mission_timeline_sequence_nonnegative check (sequence_index >= 0);

alter table mission_timeline_events
  drop constraint if exists mission_timeline_type_valid;

alter table mission_timeline_events
  add constraint mission_timeline_type_valid check (type in ('COAST', 'IMPULSIVE_BURN', 'VECTOR_BURN', 'FINITE_BURN', 'STATION_KEEPING', 'PLANE_CHANGE', 'HOHMANN_TRANSFER'));

alter table propagation_profiles
  add column if not exists integrator_type text not null default 'DORMAND_PRINCE_853',
  add column if not exists integrator_min_step double precision not null default 0.1,
  add column if not exists integrator_max_step double precision not null default 120.0,
  add column if not exists integrator_abs_tol double precision not null default 1.0,
  add column if not exists integrator_rel_tol double precision not null default 1.0;

alter table propagation_profiles
  drop constraint if exists propagation_profiles_owner_type_valid;

alter table propagation_profiles
  add constraint propagation_profiles_owner_type_valid check (owner_type in ('SATELLITE', 'MANUAL_ORBIT', 'MISSION'));

alter table propagation_profiles
  drop constraint if exists propagation_profiles_propagator_type_valid;

alter table propagation_profiles
  add constraint propagation_profiles_propagator_type_valid check (propagator_type in ('TLE_SGP4', 'KEPLERIAN', 'NUMERICAL'));

alter table propagation_profiles
  drop constraint if exists propagation_profiles_integrator_type_valid;

alter table propagation_profiles
  add constraint propagation_profiles_integrator_type_valid check (integrator_type in ('DORMAND_PRINCE_853', 'DORMAND_PRINCE_54', 'CLASSICAL_RUNGE_KUTTA', 'GILL', 'LUTHER', 'MIDPOINT', 'THREE_EIGHTHES', 'ADAMS_BASHFORTH', 'ADAMS_MOULTON', 'GRAGG_BULIRSCH_STOER'));

alter table propagation_profiles
  drop constraint if exists propagation_profiles_gravity_degree_valid;

alter table propagation_profiles
  add constraint propagation_profiles_gravity_degree_valid check (gravity_degree >= 2);

alter table propagation_profiles
  drop constraint if exists propagation_profiles_gravity_order_valid;

alter table propagation_profiles
  add constraint propagation_profiles_gravity_order_valid check (gravity_order >= 0 and gravity_order <= gravity_degree);

alter table propagation_profiles
  drop constraint if exists propagation_profiles_mass_valid;

alter table propagation_profiles
  add constraint propagation_profiles_mass_valid check (dry_mass_kg >= 0 and fuel_mass_kg >= 0);

alter table propagation_profiles
  drop constraint if exists propagation_profiles_area_valid;

alter table propagation_profiles
  add constraint propagation_profiles_area_valid check (drag_area_m2 >= 0 and srp_area_m2 >= 0);

alter table propagation_profiles
  drop constraint if exists propagation_profiles_coefficients_valid;

alter table propagation_profiles
  add constraint propagation_profiles_coefficients_valid check (drag_coefficient >= 0 and reflectivity_coefficient >= 0);

alter table propagation_profiles
  drop constraint if exists propagation_profiles_maneuver_defaults_valid;

alter table propagation_profiles
  add constraint propagation_profiles_maneuver_defaults_valid check (nominal_thrust_n >= 0 and nominal_isp_s >= 0);

alter table propagation_profiles
  drop constraint if exists propagation_profiles_integrator_valid;

alter table propagation_profiles
  add constraint propagation_profiles_integrator_valid check (integrator_min_step > 0 and integrator_max_step >= integrator_min_step and integrator_abs_tol > 0 and integrator_rel_tol > 0);

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

create table if not exists catalog_sources (
  id bigint generated always as identity primary key,
  code text not null,
  display_name text not null,
  provider_type text not null,
  base_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint catalog_sources_code_unique unique (code),
  constraint catalog_sources_code_valid check (code ~ '^[a-z0-9][a-z0-9_-]{1,62}[a-z0-9]$'),
  constraint catalog_sources_display_name_valid check (btrim(display_name) <> ''),
  constraint catalog_sources_provider_type_valid check (provider_type in ('PUBLIC', 'USER_IMPORT', 'COMMERCIAL', 'INTERNAL')),
  constraint catalog_sources_base_url_valid check (
    base_url is null
    or base_url ~ '^https?://'
  )
);

create index if not exists catalog_sources_provider_type_idx
  on catalog_sources(provider_type, code);

create table if not exists catalog_versions (
  id bigint generated always as identity primary key,
  source_id bigint not null references catalog_sources(id) on delete restrict,
  source_snapshot_id text,
  status text not null default 'IMPORTING',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  source_epoch_min timestamptz,
  source_epoch_max timestamptz,
  total_objects integer not null default 0,
  active_objects integer not null default 0,
  changed_objects integer not null default 0,
  added_objects integer not null default 0,
  removed_objects integer not null default 0,
  catalog_sha256 char(64),
  metadata jsonb not null default '{}'::jsonb,
  constraint catalog_versions_status_valid check (status in ('IMPORTING', 'AVAILABLE', 'FAILED', 'SUPERSEDED')),
  constraint catalog_versions_counts_valid check (
    total_objects >= 0
    and active_objects >= 0
    and changed_objects >= 0
    and added_objects >= 0
    and removed_objects >= 0
  ),
  constraint catalog_versions_epoch_window_valid check (
    source_epoch_min is null
    or source_epoch_max is null
    or source_epoch_min <= source_epoch_max
  ),
  constraint catalog_versions_publish_state_valid check (
    (status = 'AVAILABLE' and published_at is not null)
    or (status <> 'AVAILABLE')
  ),
  constraint catalog_versions_sha256_valid check (
    catalog_sha256 is null
    or catalog_sha256 ~ '^[0-9a-f]{64}$'
  )
);

create or replace function prevent_catalog_reference_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '% rows are historical catalog references and cannot be deleted', tg_table_name;
end;
$$;

drop trigger if exists catalog_sources_no_delete on catalog_sources;
drop trigger if exists catalog_versions_no_delete on catalog_versions;

create trigger catalog_sources_no_delete
  before delete on catalog_sources
  for each row
  execute function prevent_catalog_reference_delete();

create trigger catalog_versions_no_delete
  before delete on catalog_versions
  for each row
  execute function prevent_catalog_reference_delete();

create index if not exists catalog_versions_source_snapshot_idx
  on catalog_versions(source_id, source_snapshot_id)
  where source_snapshot_id is not null;

create index if not exists catalog_versions_status_created_idx
  on catalog_versions(status, created_at desc);

create table if not exists catalog_sync_runs (
  id bigint generated always as identity primary key,
  catalog_version_id bigint not null references catalog_versions(id) on delete restrict,
  source_id bigint not null references catalog_sources(id) on delete restrict,
  status text not null default 'RUNNING',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  source_url text,
  source_etag text,
  source_last_modified timestamptz,
  fetched_element_sets integer not null default 0,
  parsed_element_sets integer not null default 0,
  inserted_history_rows integer not null default 0,
  updated_active_rows integer not null default 0,
  unchanged_active_rows integer not null default 0,
  removed_active_rows integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  constraint catalog_sync_runs_version_unique unique (catalog_version_id),
  constraint catalog_sync_runs_status_valid check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  constraint catalog_sync_runs_counts_valid check (
    fetched_element_sets >= 0
    and parsed_element_sets >= 0
    and inserted_history_rows >= 0
    and updated_active_rows >= 0
    and unchanged_active_rows >= 0
    and removed_active_rows >= 0
  ),
  constraint catalog_sync_runs_finished_state_valid check (
    (status = 'RUNNING' and finished_at is null)
    or (status in ('SUCCEEDED', 'FAILED') and finished_at is not null)
  ),
  constraint catalog_sync_runs_time_window_valid check (
    finished_at is null
    or started_at <= finished_at
  )
);

drop trigger if exists catalog_sync_runs_no_delete on catalog_sync_runs;

create trigger catalog_sync_runs_no_delete
  before delete on catalog_sync_runs
  for each row
  execute function prevent_catalog_reference_delete();

create or replace function validate_catalog_sync_run_source()
returns trigger
language plpgsql
as $$
declare
  version_source_id bigint;
begin
  select source_id
  into version_source_id
  from catalog_versions
  where id = new.catalog_version_id;

  if version_source_id is null then
    raise exception 'catalog_sync_runs catalog_version_id % does not exist', new.catalog_version_id;
  end if;

  if version_source_id <> new.source_id then
    raise exception 'catalog_sync_runs source_id % must match catalog_versions source_id %', new.source_id, version_source_id;
  end if;

  return new;
end;
$$;

drop trigger if exists catalog_sync_runs_source_valid on catalog_sync_runs;

create trigger catalog_sync_runs_source_valid
  before insert or update on catalog_sync_runs
  for each row
  execute function validate_catalog_sync_run_source();

create index if not exists catalog_sync_runs_status_started_idx
  on catalog_sync_runs(status, started_at desc);

create table if not exists satellite_catalog_history (
  id bigint generated always as identity primary key,
  catalog_version_id bigint not null references catalog_versions(id) on delete restrict,
  sync_run_id bigint not null references catalog_sync_runs(id) on delete restrict,
  norad_cat_id integer not null,
  record_type text not null,
  object_name text,
  object_id text,
  object_type text,
  classification text,
  country_code text,
  launch_year integer,
  launch_number integer,
  launch_piece text,
  epoch_at timestamptz,
  tle_line1 text,
  tle_line2 text,
  tle_sha256 char(64),
  element_set_no integer,
  ephemeris_type integer,
  inclination_deg numeric(12, 8),
  raan_deg numeric(12, 8),
  eccentricity numeric(12, 10),
  argument_of_perigee_deg numeric(12, 8),
  mean_anomaly_deg numeric(12, 8),
  mean_motion_rev_per_day numeric(16, 10),
  mean_motion_dot numeric(16, 10),
  mean_motion_ddot numeric(16, 10),
  bstar numeric(16, 10),
  revolution_number integer,
  source_payload jsonb not null default '{}'::jsonb,
  ingested_at timestamptz not null default now(),
  constraint satellite_catalog_history_version_norad_unique unique (catalog_version_id, norad_cat_id),
  constraint satellite_catalog_history_norad_valid check (norad_cat_id > 0),
  constraint satellite_catalog_history_record_type_valid check (record_type in ('TLE', 'REMOVED')),
  constraint satellite_catalog_history_tle_payload_required check (
    record_type = 'REMOVED'
    or (
      object_name is not null
      and epoch_at is not null
      and tle_line1 is not null
      and tle_line2 is not null
      and tle_sha256 is not null
    )
  ),
  constraint satellite_catalog_history_sha256_valid check (
    tle_sha256 is null
    or tle_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint satellite_catalog_history_tle_lines_valid check (
    record_type = 'REMOVED'
    or (
      char_length(tle_line1) = 69
      and char_length(tle_line2) = 69
      and tle_line1 like '1 %'
      and tle_line2 like '2 %'
    )
  ),
  constraint satellite_catalog_history_classification_valid check (
    classification is null
    or char_length(classification) = 1
  ),
  constraint satellite_catalog_history_launch_valid check (
    (launch_year is null or launch_year between 1957 and 9999)
    and (launch_number is null or launch_number > 0)
  ),
  constraint satellite_catalog_history_element_numbers_valid check (
    (element_set_no is null or element_set_no >= 0)
    and (ephemeris_type is null or ephemeris_type between 0 and 9)
    and (revolution_number is null or revolution_number >= 0)
  ),
  constraint satellite_catalog_history_orbital_ranges_valid check (
    (inclination_deg is null or inclination_deg between 0 and 180)
    and (raan_deg is null or raan_deg >= 0 and raan_deg < 360)
    and (eccentricity is null or eccentricity >= 0 and eccentricity < 1)
    and (argument_of_perigee_deg is null or argument_of_perigee_deg >= 0 and argument_of_perigee_deg < 360)
    and (mean_anomaly_deg is null or mean_anomaly_deg >= 0 and mean_anomaly_deg < 360)
    and (mean_motion_rev_per_day is null or mean_motion_rev_per_day > 0)
  )
);

create index if not exists satellite_catalog_history_norad_version_idx
  on satellite_catalog_history(norad_cat_id, catalog_version_id desc);

create index if not exists satellite_catalog_history_version_tle_idx
  on satellite_catalog_history(catalog_version_id, norad_cat_id)
  where record_type = 'TLE';

create index if not exists satellite_catalog_history_object_name_idx
  on satellite_catalog_history(lower(object_name))
  where record_type = 'TLE';

create index if not exists satellite_catalog_history_epoch_idx
  on satellite_catalog_history(epoch_at desc, norad_cat_id)
  where record_type = 'TLE';

create index if not exists satellite_catalog_history_tle_hash_idx
  on satellite_catalog_history(tle_sha256)
  where tle_sha256 is not null;

create index if not exists satellite_catalog_history_ingested_brin_idx
  on satellite_catalog_history using brin(ingested_at);

create or replace function prevent_satellite_catalog_history_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'satellite_catalog_history is append-only; attempted TRUNCATE';
  end if;

  raise exception 'satellite_catalog_history is append-only; attempted % on history id %', tg_op, old.id;
end;
$$;

drop trigger if exists satellite_catalog_history_append_only on satellite_catalog_history;
drop trigger if exists satellite_catalog_history_no_truncate on satellite_catalog_history;

create trigger satellite_catalog_history_append_only
  before update or delete on satellite_catalog_history
  for each row
  execute function prevent_satellite_catalog_history_mutation();

create trigger satellite_catalog_history_no_truncate
  before truncate on satellite_catalog_history
  for each statement
  execute function prevent_satellite_catalog_history_mutation();

create table if not exists satellite_catalog (
  norad_cat_id integer primary key,
  current_history_id bigint not null unique references satellite_catalog_history(id) on delete restrict,
  current_version_id bigint not null references catalog_versions(id) on delete restrict,
  first_seen_version_id bigint not null references catalog_versions(id) on delete restrict,
  last_seen_version_id bigint not null references catalog_versions(id) on delete restrict,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint satellite_catalog_norad_valid check (norad_cat_id > 0),
  constraint satellite_catalog_seen_window_valid check (
    first_seen_version_id <= last_seen_version_id
    and first_seen_at <= last_seen_at
    and first_seen_version_id <= current_version_id
    and current_version_id <= last_seen_version_id
  )
);

create index if not exists satellite_catalog_last_seen_version_idx
  on satellite_catalog(last_seen_version_id desc);

create or replace function validate_satellite_catalog_projection()
returns trigger
language plpgsql
as $$
declare
  history_row satellite_catalog_history%rowtype;
begin
  select *
  into history_row
  from satellite_catalog_history
  where id = new.current_history_id;

  if history_row.id is null then
    raise exception 'satellite_catalog current_history_id % does not exist', new.current_history_id;
  end if;

  if history_row.record_type <> 'TLE' then
    raise exception 'satellite_catalog current_history_id % must reference a TLE history row', new.current_history_id;
  end if;

  if history_row.norad_cat_id <> new.norad_cat_id then
    raise exception 'satellite_catalog NORAD % cannot reference history NORAD %', new.norad_cat_id, history_row.norad_cat_id;
  end if;

  if history_row.catalog_version_id <> new.current_version_id then
    raise exception 'satellite_catalog current_version_id % must match history version %', new.current_version_id, history_row.catalog_version_id;
  end if;

  return new;
end;
$$;

drop trigger if exists satellite_catalog_projection_valid on satellite_catalog;

create trigger satellite_catalog_projection_valid
  before insert or update on satellite_catalog
  for each row
  execute function validate_satellite_catalog_projection();
