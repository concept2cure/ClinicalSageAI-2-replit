import { Router } from 'express';
import overviewRouter from './regulatory.overview.router.js';
import portfolioRouter from './regulatory.portfolio.router.js';
import qualityRouter from './regulatory.quality.router.js';
import gatekeeperRouter from './regulatory.gatekeeper.router.js';
import m3Router from './regulatory.m3.router.js';
import q12Router from './regulatory.q12.router.js';
import questionsRouter from './regulatory.questions.router.js';
import ectdRouter from './regulatory.ectd.router.js';
import tasksRouter from './regulatory.tasks.router.js';
import policyRouter from './regulatory.policy.router.js';
import integrationsRouter from './regulatory.integrations.router.js';
import playbookRouter from './regulatory.playbook.router.js';

const r = Router();

// Mount all regulatory sub-routers
r.use('/overview', overviewRouter);
r.use('/portfolio', portfolioRouter);
r.use('/quality', qualityRouter);
r.use('/gatekeeper', gatekeeperRouter);
r.use('/m3', m3Router);
r.use('/q12', q12Router);
r.use('/questions', questionsRouter);
r.use('/ectd', ectdRouter);
r.use('/tasks', tasksRouter);
r.use('/policy', policyRouter);
r.use('/integrations', integrationsRouter);
r.use('/playbook', playbookRouter);

export default r;
