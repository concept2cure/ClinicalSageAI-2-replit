-- One OPEN task per (product, section, title)
create unique index if not exists uq_guard_task_open
  on cmc_tasks(product_id, section, title)
  where status = 'OPEN';