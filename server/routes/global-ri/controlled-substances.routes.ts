/** Global RI — US DEA controlled-substance scheduling (Controlled Substances Act). */

import { Router, Request, Response } from 'express';
import { requireRole } from '../../middleware/auth';
import { limiter, AUTHOR } from './_shared';
import {
  getControlledSubstanceSchedules,
  getSchedule,
  getHandlingControls,
  CS_SCHEDULES,
  type Schedule,
} from '../../services/global-ri/controlled-substances';

const router = Router();

/** The full DEA schedule catalog (I–V). */
router.get('/controlled-substances/schedules', limiter, requireRole(AUTHOR), (_req: Request, res: Response) => {
  res.json({ scheduleIds: CS_SCHEDULES, ...getControlledSubstanceSchedules() });
});

/** A single DEA schedule (I–V). */
router.get('/controlled-substances/schedules/:schedule', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const schedule = String(Array.isArray(req.params.schedule) ? req.params.schedule[0] : req.params.schedule) as Schedule;
  if (!CS_SCHEDULES.includes(schedule)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown DEA schedule "${schedule}" (expected I/II/III/IV/V).` } });
  }
  res.json(getSchedule(schedule));
});

/** Handling / prescription / quota controls for a DEA schedule. */
router.get('/controlled-substances/handling/:schedule', limiter, requireRole(AUTHOR), (req: Request, res: Response) => {
  const schedule = String(Array.isArray(req.params.schedule) ? req.params.schedule[0] : req.params.schedule) as Schedule;
  if (!CS_SCHEDULES.includes(schedule)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Unknown DEA schedule "${schedule}".` } });
  }
  res.json(getHandlingControls(schedule));
});

export default router;
