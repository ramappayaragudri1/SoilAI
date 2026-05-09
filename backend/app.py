"""
SoilAI Cloud Lab - Flask Backend
Provides REST API for soil test calculations and Firestore data management.
Demonstrates Cloud Computing and Distributed Computing Systems concepts.
"""

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import json
from datetime import datetime
from calculations import process_soil_test, validate_trial_input, get_compaction_recommendations

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ──────────────────────────────────────────────────────────────────────────────
# Static page routes
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('../frontend', 'index.html')

@app.route('/signup')
def signup():
    return send_from_directory('../frontend', 'signup.html')

@app.route('/forgot-password')
def forgot_password():
    return send_from_directory('../frontend', 'forgot-password.html')

@app.route('/dashboard')
def dashboard():
    return send_from_directory('../frontend', 'dashboard.html')

@app.route('/moisture')
def moisture():
    return send_from_directory('../frontend', 'moisture.html')

@app.route('/proctor')
def proctor():
    return send_from_directory('../frontend', 'proctor.html')

@app.route('/reports')
def reports():
    return send_from_directory('../frontend', 'reports.html')

@app.route('/compare')
def compare():
    return send_from_directory('../frontend', 'compare.html')


# ──────────────────────────────────────────────────────────────────────────────
# API: Soil Test Calculation Engine
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/api/calculate', methods=['POST'])
def calculate():
    """
    Main calculation endpoint.
    Accepts trial data and returns calculated moisture content, dry density,
    OMC, MDD, and compaction recommendations.

    Distributed Computing: This endpoint processes data that is stored in
    Firebase Firestore, enabling real-time sync across distributed clients.
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'No data provided'}), 400

        trials = data.get('trials', [])

        if not trials:
            return jsonify({'error': 'No trial data provided'}), 400

        if len(trials) < 2:
            return jsonify({'error': 'At least 2 trials are required to calculate OMC and MDD'}), 400

        # Validate all trials first
        all_errors = []
        for i, trial in enumerate(trials):
            errors = validate_trial_input(trial)
            if errors:
                for err in errors:
                    all_errors.append(f"Trial {i + 1}: {err}")

        if all_errors:
            return jsonify({'error': 'Validation failed', 'details': all_errors}), 422

        # Process the soil test
        results = process_soil_test(trials)

        # Add metadata
        results['calculated_at'] = datetime.utcnow().isoformat() + 'Z'
        results['test_name'] = data.get('test_name', f"Soil Test {datetime.utcnow().strftime('%Y-%m-%d')}")
        results['location'] = data.get('location', 'Not specified')
        results['soil_type'] = data.get('soil_type', 'Not specified')

        return jsonify({
            'success': True,
            'data': results
        })

    except ValueError as e:
        return jsonify({'error': str(e)}), 422
    except Exception as e:
        return jsonify({'error': f'Calculation error: {str(e)}'}), 500


@app.route('/api/calculate/single-trial', methods=['POST'])
def calculate_single_trial():
    """
    Calculate moisture content and dry density for a single trial.
    Used for real-time preview as user types.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        errors = validate_trial_input(data)
        if errors:
            return jsonify({'error': 'Validation failed', 'details': errors}), 422

        W1 = float(data['W1'])
        W2 = float(data['W2'])
        W3 = float(data['W3'])
        wet_density = float(data['wet_density'])

        from calculations import calculate_moisture_content, calculate_dry_density
        moisture = calculate_moisture_content(W1, W2, W3)
        dry_density = calculate_dry_density(wet_density, moisture)

        return jsonify({
            'success': True,
            'moisture_content': moisture,
            'dry_density': dry_density,
            'water_content_g': round(W2 - W3, 4),
            'dry_soil_g': round(W3 - W1, 4)
        })

    except ValueError as e:
        return jsonify({'error': str(e)}), 422
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/recommendations', methods=['POST'])
def recommendations():
    """
    Get compaction recommendations for given moisture content and dry density
    relative to OMC and MDD.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required = ['moisture_content', 'omc', 'dry_density', 'mdd']
        missing = [f for f in required if f not in data]
        if missing:
            return jsonify({'error': f'Missing fields: {", ".join(missing)}'}), 400

        recs, status = get_compaction_recommendations(
            float(data['moisture_content']),
            float(data['omc']),
            float(data['dry_density']),
            float(data['mdd'])
        )

        return jsonify({
            'success': True,
            'recommendations': recs,
            'status': status
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ──────────────────────────────────────────────────────────────────────────────
# API: Health & System Info (Cloud Computing Demonstration)
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/api/health', methods=['GET'])
def health():
    """
    Health check endpoint — demonstrates distributed system availability.
    In a real cloud deployment, this would be behind a load balancer.
    """
    return jsonify({
        'status': 'healthy',
        'service': 'SoilAI Cloud Lab API',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'computing_nodes': {
            'api_server': 'Flask/Python (Local / Cloud-deployable)',
            'database': 'Firebase Firestore (Distributed NoSQL)',
            'auth': 'Firebase Authentication (Federated Identity)',
            'storage': 'Firebase Storage (Cloud Object Store)'
        },
        'distributed_features': [
            'Real-time Firestore synchronization',
            'Multi-user concurrent access',
            'Cloud-based persistent storage',
            'Cross-device session management',
            'Automatic conflict resolution via Firestore'
        ]
    })


@app.route('/api/system-info', methods=['GET'])
def system_info():
    """
    System information endpoint for the distributed computing dashboard panel.
    """
    return jsonify({
        'system': 'SoilAI Cloud Lab',
        'architecture': 'Distributed Multi-Tier',
        'tiers': {
            'presentation': 'HTML5/CSS3/Vanilla JS (CDN-deployable)',
            'application': 'Flask REST API (Python)',
            'data': 'Firebase Firestore (Google Cloud NoSQL)',
            'identity': 'Firebase Auth (OAuth2 / JWT)'
        },
        'cloud_features': {
            'real_time_sync': 'Firestore onSnapshot listeners',
            'authentication': 'Firebase Auth with JWT tokens',
            'scalability': 'Horizontal scaling via Firebase',
            'availability': '99.99% SLA (Firebase)',
            'geo_replication': 'Multi-region Firestore'
        }
    })


# ──────────────────────────────────────────────────────────────────────────────
# API: Sample Data (for demo/testing)
# ──────────────────────────────────────────────────────────────────────────────

@app.route('/api/sample-data', methods=['GET'])
def sample_data():
    """Return sample soil test data for demonstration."""
    sample_trials = [
        {"W1": 25.0, "W2": 162.5, "W3": 150.0, "wet_density": 1.87, "trial_number": 1},
        {"W1": 25.0, "W2": 165.0, "W3": 150.0, "wet_density": 2.07, "trial_number": 2},
        {"W1": 25.0, "W2": 167.5, "W3": 150.0, "wet_density": 2.19, "trial_number": 3},
        {"W1": 25.0, "W2": 170.0, "W3": 150.0, "wet_density": 2.18, "trial_number": 4},
        {"W1": 25.0, "W2": 172.5, "W3": 150.0, "wet_density": 2.065, "trial_number": 5},
    ]

    try:
        results = process_soil_test(sample_trials)
        return jsonify({
            'success': True,
            'sample_trials': sample_trials,
            'results': results,
            'note': 'Sample data for demonstration purposes'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ──────────────────────────────────────────────────────────────────────────────
# Error Handlers
# ──────────────────────────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found', 'status': 404}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': 'Method not allowed', 'status': 405}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': 'Internal server error', 'status': 500}), 500


# ──────────────────────────────────────────────────────────────────────────────
# Entry Point
# ──────────────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 60)
    print("  SoilAI Cloud Lab - Geotechnical Analytics Platform")
    print("  Cloud Computing & Distributed Systems Demo")
    print("=" * 60)
    print(f"  Server: http://localhost:5000")
    print(f"  API Health: http://localhost:5000/api/health")
    print(f"  Dashboard: http://localhost:5000/dashboard")
    print("=" * 60)
    app.run(debug=True, host='0.0.0.0', port=5000)
