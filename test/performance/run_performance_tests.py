
"""
Performance test runner for TrialSage
Executes concurrent load tests and generates reports
"""

import subprocess
import os
import sys
import time
from datetime import datetime

def run_locust_test(test_file, users=50, spawn_rate=5, duration="5m", host="http://localhost:5000"):
    """Run locust performance test"""
    print(f"🚀 Starting performance test: {test_file}")
    print(f"   Users: {users}, Spawn Rate: {spawn_rate}, Duration: {duration}")
    print(f"   Target Host: {host}")
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = f"test/performance/reports/{timestamp}"
    os.makedirs(report_dir, exist_ok=True)
    
    cmd = [
        "locust",
        "-f", test_file,
        "--headless",
        "--users", str(users),
        "--spawn-rate", str(spawn_rate),
        "--run-time", duration,
        "--host", host,
        "--html", f"{report_dir}/performance_report.html",
        "--csv", f"{report_dir}/performance_data"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        if result.returncode == 0:
            print("✅ Performance test completed successfully")
            print(f"📊 Reports saved to: {report_dir}")
        else:
            print("❌ Performance test failed")
            print(f"Error: {result.stderr}")
            
        return result.returncode == 0
        
    except subprocess.TimeoutExpired:
        print("⏱️ Performance test timed out")
        return False
    except Exception as e:
        print(f"❌ Error running performance test: {e}")
        return False

def check_server_health(host="http://localhost:5000"):
    """Check if the server is running before tests"""
    import requests
    try:
        response = requests.get(f"{host}/api/health", timeout=5)
        return response.status_code == 200
    except:
        return False

def main():
    # Check if server is running
    if not check_server_health():
        print("❌ Server is not running on localhost:5000")
        print("Please start the TrialSage server before running performance tests")
        sys.exit(1)
    
    print("🔄 TrialSage Performance Testing Suite")
    print("=====================================")
    
    # Test scenarios
    scenarios = [
        {
            "name": "Document Operations",
            "file": "test/performance/locust_tests.py:DocumentOperationsUser",
            "users": 30,
            "spawn_rate": 3,
            "duration": "3m"
        },
        {
            "name": "Vault Operations", 
            "file": "test/performance/locust_tests.py:VaultOperationsUser",
            "users": 20,
            "spawn_rate": 2,
            "duration": "3m"
        }
    ]
    
    results = []
    for scenario in scenarios:
        print(f"\n📋 Running scenario: {scenario['name']}")
        success = run_locust_test(
            scenario['file'],
            scenario['users'],
            scenario['spawn_rate'],
            scenario['duration']
        )
        results.append((scenario['name'], success))
        
        # Brief pause between tests
        time.sleep(10)
    
    # Summary
    print("\n📊 Performance Test Summary")
    print("===========================")
    for name, success in results:
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{name}: {status}")

if __name__ == "__main__":
    main()
