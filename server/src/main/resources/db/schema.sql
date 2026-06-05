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
