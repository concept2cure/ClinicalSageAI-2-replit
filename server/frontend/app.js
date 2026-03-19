// Concept2Cure Frontend Application

// Global state
let currentThreadId = null;
let currentProtocolData = null;
let pdfPath = null;

// DOM elements
const protocolForm = document.getElementById('protocol-form');
const generateBtn = document.getElementById('generate-btn');
const weeklyReportBtn = document.getElementById('weekly-report-btn');
const viewReportBtn = document.getElementById('view-report-btn');
const downloadReportBtn = document.getElementById('download-report-btn');
const askBtn = document.getElementById('ask-btn');

const loadingContainer = document.getElementById('loading-container');
const protocolContainer = document.getElementById('protocol-container');
const followUpContainer = document.getElementById('follow-up-container');
const followUpResponseContainer = document.getElementById('follow-up-response-container');
const reportPreviewContainer = document.getElementById('report-preview-container');

const protocolContent = document.getElementById('protocol-content');
const indContent = document.getElementById('ind-content');
const riskContent = document.getElementById('risk-content');
const citationsList = document.getElementById('citations-list');
const quotesContent = document.getElementById('quotes-content');
const followUpResponse = document.getElementById('follow-up-response');
const pdfPreview = document.getElementById('pdf-preview');

// Tab switching
document.querySelectorAll('.tab-btn').forEach(button => {
  button.addEventListener('click', () => {
    // Reset all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('bg-blue-600', 'text-white');
      btn.classList.add('bg-gray-200', 'text-gray-700');
    });

    // Highlight active button
    button.classList.remove('bg-gray-200', 'text-gray-700');
    button.classList.add('bg-blue-600', 'text-white');

    // Hide all content
    document.querySelectorAll('.tab-content').forEach(content => {
      content.style.display = 'none';
    });

    // Show selected content
    const tabId = button.getAttribute('data-tab');
    document.getElementById(`${tabId}-tab`).style.display = 'block';
  });
});

// Protocol generation
protocolForm.addEventListener('submit', async e => {
  e.preventDefault();

  const indication = document.getElementById('indication').value.trim();
  if (!indication) {
    alert('Please enter an indication');
    return;
  }

  const phase = document.getElementById('phase').value;
  const endpoint = document.getElementById('endpoint').value.trim() || undefined;

  showLoading(true);

  try {
    const response = await fetch('/api/intel/protocol-suggestions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        indication,
        phase,
        primary_endpoint: endpoint,
        thread_id: currentThreadId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    currentThreadId = data.thread_id;
    currentProtocolData = data;

    // Display the protocol data
    displayProtocolData(data);

    // Show follow-up container
    followUpContainer.style.display = 'block';
  } catch (error) {
    console.error('Error generating protocol:', error);
    alert('Failed to generate protocol. Please try again.');
  } finally {
    showLoading(false);
  }
});

// Weekly report generation
weeklyReportBtn.addEventListener('click', async () => {
  showLoading(true);

  try {
    const response = await fetch('/api/intel/scheduled-report');
    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();
    pdfPath = data.pdf;

    // Update PDF preview
    pdfPreview.src = pdfPath;
    reportPreviewContainer.style.display = 'block';

    // Hide protocol container if it's visible
    protocolContainer.style.display = 'none';
    followUpResponseContainer.style.display = 'none';

    // Update download button
    downloadReportBtn.href = pdfPath;

    alert('Weekly report generated successfully!');
  } catch (error) {
    console.error('Error generating weekly report:', error);
    alert('Failed to generate weekly report. Please try again.');
  } finally {
    showLoading(false);
  }
});

// View report button
viewReportBtn.addEventListener('click', () => {
  // Set default path if no report has been generated
  const path = pdfPath || '/static/latest_report.pdf';
  pdfPreview.src = path;
  reportPreviewContainer.style.display = 'block';

  // Hide other containers
  protocolContainer.style.display = 'none';
  followUpResponseContainer.style.display = 'none';
});

// Ask follow-up question
askBtn.addEventListener('click', async () => {
  const question = document.getElementById('follow-up-question').value.trim();
  if (!question) {
    alert('Please enter a question');
    return;
  }

  if (!currentThreadId) {
    alert('Please generate a protocol first');
    return;
  }

  showLoading(true);

  try {
    const response = await fetch('/api/intel/continue-thread', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        thread_id: currentThreadId,
        study_id: 'FOLLOW_UP',
        section: 'question',
        context: question,
      }),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    const data = await response.json();

    // Display the response
    followUpResponse.innerHTML = convertToHtml(data.content);
    followUpResponseContainer.style.display = 'block';

    // Clear the question input
    document.getElementById('follow-up-question').value = '';
  } catch (error) {
    console.error('Error asking follow-up question:', error);
    alert('Failed to process your question. Please try again.');
  } finally {
    showLoading(false);
  }
});

// Helper functions
function showLoading(show) {
  loadingContainer.style.display = show ? 'block' : 'none';
}

function displayProtocolData(data) {
  // Show the protocol container
  protocolContainer.style.display = 'block';

  // Update protocol tab
  protocolContent.innerHTML = convertToHtml(data.recommendation);

  // Update IND tab
  indContent.innerHTML = convertToHtml(
    data.ind_module_2_5?.content || 'No IND module data available.'
  );

  // Update risk tab
  riskContent.innerHTML = convertToHtml(data.risk_summary || 'No risk analysis available.');

  // Update evidence tab
  citationsList.innerHTML = '';
  if (data.citations && data.citations.length > 0) {
    data.citations.forEach(citation => {
      const li = document.createElement('li');
      li.textContent = citation;
      citationsList.appendChild(li);
    });
  } else {
    citationsList.innerHTML = '<li>No citations available.</li>';
  }

  // Update quotes
  if (data.quotes && data.quotes.length > 0) {
    let quotesHtml = '';
    data.quotes.forEach(quote => {
      quotesHtml += `<div class="border-l-4 border-gray-300 pl-4 mb-4">
                <p class="italic">${quote.quote}</p>
                <p class="text-sm text-gray-600">Source: ${quote.csr}</p>
            </div>`;
    });
    quotesContent.innerHTML = quotesHtml;
  } else {
    quotesContent.innerHTML = 'No supporting quotes available.';
  }
}

function convertToHtml(text) {
  if (!text) return '';

  // Convert line breaks to <br> tags
  return text
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^/, '<p>')
    .replace(/$/, '</p>');
}
