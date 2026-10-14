-- Run these read-only queries in Supabase SQL Editor to compare load before and after deployment.
-- pg_stat_statements counters are cumulative since their last reset; compare equal time windows.

-- Queries consuming the most total execution time.
select calls,
       round(total_exec_time::numeric, 1) as total_ms,
       round(mean_exec_time::numeric, 2) as mean_ms,
       rows,
       shared_blks_read,
       left(query, 500) as query
from pg_stat_statements
where query ilike '%daily_report_snapshots%'
   or query ilike '%metric_snapshots%'
   or query ilike '%location_platforms%'
order by total_exec_time desc
limit 20;

-- Table size and estimated live/dead rows.
select s.relname as table_name,
       s.n_live_tup,
       s.n_dead_tup,
       pg_size_pretty(pg_total_relation_size(s.relid)) as total_size
from pg_stat_user_tables as s
where s.schemaname = 'public'
  and s.relname in ('locations', 'location_platforms', 'metric_snapshots', 'daily_report_snapshots')
order by pg_total_relation_size(s.relid) desc;

-- Current database connection states.
select state, count(*) as connections
from pg_stat_activity
where datname = current_database()
group by state
order by connections desc;
