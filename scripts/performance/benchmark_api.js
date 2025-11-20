/**
 * TrialSage API Benchmarking Script
 * Tests concurrent document upload/download performance
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

class TrialSageAPIBenchmark {
  constructor(baseURL = 'http://localhost:5000') {
    this.baseURL = baseURL;
    this.headers = {
      Authorization: 'TS_DEV',
      'Content-Type': 'application/json',
    };
    this.results = {
      uploads: [],
      downloads: [],
      searches: [],
    };
  }

  /**
   * Create test document for uploads
   */
  createTestDocument(size = 1024) {
    const content = 'Test document content '.repeat(Math.ceil(size / 20));
    return Buffer.from(content.substring(0, size));
  }

  /**
   * Test concurrent document uploads
   */
  async benchmarkUploads(concurrency = 10, iterations = 5) {
    console.log(`🚀 Testing ${concurrency} concurrent uploads for ${iterations} iterations`);

    const uploadPromises = [];

    for (let i = 0; i < concurrency; i++) {
      for (let j = 0; j < iterations; j++) {
        const promise = this.performUpload(i, j);
        uploadPromises.push(promise);
      }
    }

    const startTime = Date.now();
    const results = await Promise.allSettled(uploadPromises);
    const endTime = Date.now();

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Upload Results:`);
    console.log(`   Total Time: ${endTime - startTime}ms`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${failed}`);
    console.log(
      `   Throughput: ${(successful / ((endTime - startTime) / 1000)).toFixed(2)} uploads/sec`
    );

    return {
      totalTime: endTime - startTime,
      successful,
      failed,
      throughput: successful / ((endTime - startTime) / 1000),
    };
  }

  /**
   * Perform single document upload
   */
  async performUpload(userId, docId) {
    const startTime = Date.now();

    try {
      const formData = new FormData();
      const testDoc = this.createTestDocument(2048); // 2KB test document

      formData.append('document', testDoc, `test_doc_${userId}_${docId}.txt`);
      formData.append('tenant_id', 'benchmark_test');
      formData.append('document_type', 'protocol');
      formData.append('module', 'test');

      const response = await axios.post(`${this.baseURL}/api/documents/upload`, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: 'TS_DEV',
        },
        timeout: 30000,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.uploads.push({
        userId,
        docId,
        duration,
        status: response.status,
        success: true,
      });

      return { success: true, duration, documentId: response.data.id };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.uploads.push({
        userId,
        docId,
        duration,
        status: error.response?.status || 0,
        success: false,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Test concurrent document downloads
   */
  async benchmarkDownloads(documentIds, concurrency = 10) {
    if (documentIds.length === 0) {
      console.log('⚠️ No documents available for download testing');
      return { successful: 0, failed: 0, throughput: 0 };
    }

    console.log(`⬇️ Testing ${concurrency} concurrent downloads`);

    const downloadPromises = [];

    for (let i = 0; i < concurrency; i++) {
      const docId = documentIds[i % documentIds.length];
      const promise = this.performDownload(docId, i);
      downloadPromises.push(promise);
    }

    const startTime = Date.now();
    const results = await Promise.allSettled(downloadPromises);
    const endTime = Date.now();

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Download Results:`);
    console.log(`   Total Time: ${endTime - startTime}ms`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${failed}`);
    console.log(
      `   Throughput: ${(successful / ((endTime - startTime) / 1000)).toFixed(2)} downloads/sec`
    );

    return {
      totalTime: endTime - startTime,
      successful,
      failed,
      throughput: successful / ((endTime - startTime) / 1000),
    };
  }

  /**
   * Perform single document download
   */
  async performDownload(documentId, userId) {
    const startTime = Date.now();

    try {
      const response = await axios.get(`${this.baseURL}/api/documents/${documentId}/download`, {
        headers: this.headers,
        timeout: 30000,
        responseType: 'stream',
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.downloads.push({
        documentId,
        userId,
        duration,
        status: response.status,
        success: true,
      });

      return { success: true, duration };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.downloads.push({
        documentId,
        userId,
        duration,
        status: error.response?.status || 0,
        success: false,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Test search performance
   */
  async benchmarkSearch(queries, concurrency = 5) {
    console.log(`🔍 Testing ${concurrency} concurrent searches`);

    const searchPromises = [];

    for (let i = 0; i < concurrency; i++) {
      const query = queries[i % queries.length];
      const promise = this.performSearch(query, i);
      searchPromises.push(promise);
    }

    const startTime = Date.now();
    const results = await Promise.allSettled(searchPromises);
    const endTime = Date.now();

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`✅ Search Results:`);
    console.log(`   Total Time: ${endTime - startTime}ms`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${failed}`);
    console.log(
      `   Avg Response: ${successful > 0 ? ((endTime - startTime) / successful).toFixed(2) : 0}ms per search`
    );

    return {
      totalTime: endTime - startTime,
      successful,
      failed,
      avgResponseTime: successful > 0 ? (endTime - startTime) / successful : 0,
    };
  }

  /**
   * Perform single search
   */
  async performSearch(query, userId) {
    const startTime = Date.now();

    try {
      const response = await axios.get(`${this.baseURL}/api/documents/search`, {
        params: {
          q: query,
          tenant_id: 'benchmark_test',
        },
        headers: this.headers,
        timeout: 15000,
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.searches.push({
        query,
        userId,
        duration,
        status: response.status,
        results: response.data.results?.length || 0,
        success: true,
      });

      return { success: true, duration, results: response.data.results?.length || 0 };
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      this.results.searches.push({
        query,
        userId,
        duration,
        status: error.response?.status || 0,
        success: false,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Generate benchmark report
   */
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        uploads: {
          total: this.results.uploads.length,
          successful: this.results.uploads.filter(r => r.success).length,
          failed: this.results.uploads.filter(r => !r.success).length,
          avgDuration:
            this.results.uploads.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) /
            Math.max(1, this.results.uploads.filter(r => r.success).length),
        },
        downloads: {
          total: this.results.downloads.length,
          successful: this.results.downloads.filter(r => r.success).length,
          failed: this.results.downloads.filter(r => !r.success).length,
          avgDuration:
            this.results.downloads.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) /
            Math.max(1, this.results.downloads.filter(r => r.success).length),
        },
        searches: {
          total: this.results.searches.length,
          successful: this.results.searches.filter(r => r.success).length,
          failed: this.results.searches.filter(r => !r.success).length,
          avgDuration:
            this.results.searches.filter(r => r.success).reduce((sum, r) => sum + r.duration, 0) /
            Math.max(1, this.results.searches.filter(r => r.success).length),
        },
      },
      details: this.results,
    };

    return report;
  }
}

/**
 * Main benchmark execution
 */
async function runBenchmark() {
  console.log('🚀 TrialSage API Performance Benchmark');
  console.log('=====================================');

  const benchmark = new TrialSageAPIBenchmark();

  try {
    // Test uploads
    const uploadResults = await benchmark.benchmarkUploads(10, 3);

    // Get some document IDs for download testing
    const documentIds = benchmark.results.uploads
      .filter(r => r.success)
      .map((r, index) => `doc_${index}`); // Mock IDs for testing

    // Test downloads
    await benchmark.benchmarkDownloads(documentIds.slice(0, 5), 5);

    // Test search
    const searchQueries = ['protocol', 'clinical', 'study', 'regulatory', 'compliance'];
    await benchmark.benchmarkSearch(searchQueries, 5);

    // Generate and save report
    const report = benchmark.generateReport();

    console.log('\n📊 Final Benchmark Report');
    console.log('=========================');
    console.log(JSON.stringify(report.summary, null, 2));

    // Save detailed report
    const reportPath = `test/performance/reports/benchmark_${Date.now()}.json`;
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📄 Detailed report saved: ${reportPath}`);
  } catch (error) {
    console.error('❌ Benchmark failed:', error.message);
    process.exit(1);
  }
}

// Run benchmark if called directly
if (require.main === module) {
  runBenchmark();
}

module.exports = { TrialSageAPIBenchmark };
