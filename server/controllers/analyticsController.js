const analyticsMetrics = {
  submissionsLast90Days: 8,
  avgReviewTimeDays: 32,
  delayRiskPercent: 25,
};

const getAnalyticsMetrics = (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: analyticsMetrics,
    });
  } catch (error) {
    console.error('Error fetching analytics metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics metrics',
    });
  }
};

module.exports = { getAnalyticsMetrics };
