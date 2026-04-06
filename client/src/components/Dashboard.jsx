// Dashboard.jsx
import React, { useState, useEffect } from 'react';
import {
 BarChart,
 Bar,
 XAxis,
 YAxis,
 CartesianGrid,
 Tooltip,
 Legend,
 ResponsiveContainer,
} from 'recharts';

const Dashboard = ({ ndcCodes }) => {
 const [chartData, setChartData] = useState(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState('');

 const fetchComparativeData = async () => {
 if (!ndcCodes || ndcCodes.length === 0) return;

 setLoading(true);
 setError('');
 try {
 const response = await fetch('/api/cer/analyze', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ ndc_codes: ndcCodes }),
 });

 if (!response.ok) {
 throw new Error('Failed to fetch comparative analysis data.');
 }

 const data = await response.json();

 if (!data.success) {
 throw new Error(data.message || 'Failed to analyze data');
 }

 // Format data for Recharts
 const formattedData = data.visualization_data.event_labels.map((label, index) => {
 const dataPoint = { name: label };
 data.visualization_data.comparative_data.forEach(dataset => {
 dataPoint[dataset.label] = dataset.data[index];
 });
 return dataPoint;
 });
 setChartData(formattedData);
 } catch (e) {
 console.error('Error fetching comparative data:', e);
 setError(e.message);
 } finally {
 setLoading(false);
 }
 };

 useEffect(() => {
 fetchComparativeData();
 }, [ndcCodes]);

 if (error) {
 return (
 <div
 style={{
 margin: '20px',
 padding: '15px',
 border: '1px solid #f5c6cb',
 borderRadius: '4px',
 backgroundColor: '#f8d7da',
 color: '#721c24',
 }}
 >
 <h3>Error Loading Comparative Data</h3>
 <p>{error}</p>
 </div>
 );
 }

 if (loading) {
 return (
 <div style={{ margin: '20px', textAlign: 'center', padding: '20px' }}>
 <div style={{ fontSize: '24px', marginBottom: '10px' }}>
 Loading comparative analysis...
 </div>
 <div
 style={{
 width: '50px',
 height: '50px',
 margin: 'auto',
 border: '5px solid #f3f3f3',
 borderTop: '5px solid #3498db',
 borderRadius: '50%',
 animation: 'spin 2s linear infinite',
 }}
 ></div>
 <style>{`
 @keyframes spin {
 0% { transform: rotate(0deg); }
 100% { transform: rotate(360deg); }
 }
 `}</style>
 </div>
 );
 }

 if (!chartData || !Array.isArray(chartData) || chartData.length === 0) {
 return (
 <div
 style={{
 margin: '20px',
 padding: '15px',
 border: '1px solid #bee5eb',
 borderRadius: '4px',
 backgroundColor: '#d1ecf1',
 color: '#0c5460',
 }}
 >
 <h3>No Data Available</h3>
 <p>
 There is no comparative data available for the selected NDC codes. Please try different
 codes or ensure the API is functioning correctly.
 </p>
 </div>
 );
 }

 // Fixed color palette for bars
 const colors = [
 '#3498db',
 '#2ecc71',
 '#e74c3c',
 '#f39c12',
 '#9b59b6',
 '#1abc9c',
 '#d35400',
 '#34495e',
 ];

 return (
 <div
 style={{
 margin: '20px',
 padding: '20px',
 border: '1px solid #ddd',
 borderRadius: '8px',
 boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
 }}
 >
 <h2
 style={{ borderBottom: '2px solid #3498db', paddingBottom: '10px', marginBottom: '20px' }}
 >
 Comparative Analysis Dashboard
 </h2>

 <div style={{ marginBottom: '20px' }}>
 <h3>Analyzing NDC Codes:</h3>
 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
 {ndcCodes.map((code, index) => (
 <span
 key={index}
 style={{
 padding: '6px 12px',
 backgroundColor: '#e9ecef',
 borderRadius: '20px',
 fontSize: '14px',
 fontWeight: 'bold',
 }}
 >
 {code}
 </span>
 ))}
 </div>
 </div>

 <div style={{ height: '400px', marginBottom: '20px' }}>
 <ResponsiveContainer width="100%" height="100%">
 <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
 <CartesianGrid strokeDasharray="3 3" />
 <XAxis dataKey="name" />
 <YAxis label={{ value: 'Adverse Event Count', angle: -90, position: 'insideLeft' }} />
 <Tooltip />
 <Legend />
 {/* Dynamically add bars based on the first data point's keys excluding 'name' */}
 {Object.keys(chartData[0] || {})
 .filter(key => key !== 'name')
 .map((key, index) => (
 <Bar key={index} dataKey={key} fill={colors[index % colors.length]} />
 ))}
 </BarChart>
 </ResponsiveContainer>
 </div>

 <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
 <button
 onClick={fetchComparativeData}
 style={{
 padding: '10px 20px',
 backgroundColor: '#3498db',
 color: 'white',
 border: 'none',
 borderRadius: '4px',
 cursor: 'pointer',
 fontSize: '16px',
 }}
 >
 Refresh Data
 </button>
 </div>
 </div>
 );
};

export default Dashboard;
