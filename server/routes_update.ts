// Import intelligence report routes
import intelligenceReportRoutes from './routes/intelligence_report_routes';

// Inside the registerRoutes function, add this line to use our new router
app.use('/api', intelligenceReportRoutes);
