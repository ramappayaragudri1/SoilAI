"""
SoilAI Cloud Lab - Geotechnical Calculation Engine
Handles Moisture Content, Dry Density, OMC, and MDD calculations
"""


def calculate_moisture_content(W1, W2, W3):
    """
    Calculate moisture content.
    W1 = Weight of empty container (g)
    W2 = Weight of container + wet soil (g)
    W3 = Weight of container + dry soil (g)
    Formula: w = ((W2 - W3) / (W3 - W1)) * 100
    """
    water_weight = W2 - W3
    dry_soil_weight = W3 - W1

    if dry_soil_weight <= 0:
        raise ValueError("Dry soil weight must be greater than zero (W3 - W1 > 0)")
    if water_weight < 0:
        raise ValueError("Water weight cannot be negative (W2 must be >= W3)")

    moisture_content = (water_weight / dry_soil_weight) * 100
    return round(moisture_content, 4)


def calculate_dry_density(wet_density, moisture_content):
    """
    Calculate dry density.
    Formula: Dry Density = Wet Density / (1 + Moisture Content/100)
    Returns in g/cm³ (or same units as wet_density)
    Typical Soil Range: 1.4 to 2.2 g/cm³
    """
    wd = float(wet_density)
    mc = float(moisture_content)
    
    if wd <= 0:
        raise ValueError("Wet density must be greater than zero")
    if mc < 0:
        raise ValueError("Moisture content cannot be negative")

    # Explicit calculation to avoid any precision or conversion issues
    # Formula: DD = WD / (1 + mc/100)
    dry_density = wd / (1.0 + (mc / 100.0))
    
    return round(dry_density, 4)


def find_omc_mdd(trials):
    """
    Find Optimum Moisture Content (OMC) and Maximum Dry Density (MDD)
    using quadratic regression if enough points are available.
    
    trials: list of dicts with 'moisture_content' and 'dry_density' keys
    Returns: (omc, mdd, regression_fit)
    """
    if not trials or len(trials) < 2:
        raise ValueError("At least 2 trials are required to determine OMC and MDD")

    if len(trials) >= 3:
        # Perform Quadratic Regression: y = ax^2 + bx + c
        n = len(trials)
        sum_x = sum(t['moisture_content'] for t in trials)
        sum_x2 = sum(t['moisture_content']**2 for t in trials)
        sum_x3 = sum(t['moisture_content']**3 for t in trials)
        sum_x4 = sum(t['moisture_content']**4 for t in trials)
        sum_y = sum(t['dry_density'] for t in trials)
        sum_xy = sum(t['moisture_content'] * t['dry_density'] for t in trials)
        sum_x2y = sum(t['moisture_content']**2 * t['dry_density'] for t in trials)

        # Solve system of equations using Cramer's Rule
        # Matrix M:
        # [[sum_x4, sum_x3, sum_x2],
        #  [sum_x3, sum_x2, sum_x],
        #  [sum_x2, sum_x,  n]]
        
        def determinant(m):
            return (m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
                    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
                    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]))

        matrix_m = [[sum_x4, sum_x3, sum_x2], [sum_x3, sum_x2, sum_x], [sum_x2, sum_x, n]]
        det_m = determinant(matrix_m)

        if abs(det_m) > 1e-10:
            matrix_a = [[sum_x2y, sum_x3, sum_x2], [sum_xy, sum_x2, sum_x], [sum_y, sum_x, n]]
            matrix_b = [[sum_x4, sum_x2y, sum_x2], [sum_x3, sum_xy, sum_x], [sum_x2, sum_y, n]]
            matrix_c = [[sum_x4, sum_x3, sum_x2y], [sum_x3, sum_x2, sum_xy], [sum_x2, sum_x, sum_y]]

            a = determinant(matrix_a) / det_m
            b = determinant(matrix_b) / det_m
            c = determinant(matrix_c) / det_m

            if a < 0:
                # Proper downward parabola
                omc = -b / (2 * a)
                mdd = a * omc**2 + b * omc + c
                
                # Validation: Peak should be within or near the data range
                min_mc = min(t['moisture_content'] for t in trials)
                max_mc = max(t['moisture_content'] for t in trials)
                if min_mc - 2 <= omc <= max_mc + 2:
                    return round(omc, 4), round(mdd, 4), {'a': a, 'b': b, 'c': c}

    # Fallback: Find the trial with maximum dry density
    max_trial = max(trials, key=lambda x: x['dry_density'])
    mdd = max_trial['dry_density']
    omc = max_trial['moisture_content']

    return round(omc, 4), round(mdd, 4), None


def get_compaction_recommendations(moisture_content, omc, dry_density, mdd):
    """
    Generate intelligent rule-based recommendations based on test results.
    """
    recommendations = []
    status = "optimal"

    # Moisture content recommendations
    moisture_diff = moisture_content - omc
    density_ratio = (dry_density / mdd) * 100 if mdd > 0 else 0

    if moisture_content < omc * 0.9:
        recommendations.append({
            "type": "warning",
            "icon": "💧",
            "title": "Add Water",
            "message": f"Moisture content ({moisture_content:.2f}%) is significantly below OMC ({omc:.2f}%). Add water to achieve optimal compaction.",
            "action": f"Increase moisture by approximately {abs(moisture_diff):.2f}%"
        })
        status = "dry"
    elif moisture_content < omc:
        recommendations.append({
            "type": "info",
            "icon": "💧",
            "title": "Slightly Dry",
            "message": f"Moisture content ({moisture_content:.2f}%) is slightly below OMC ({omc:.2f}%). Minor water addition recommended.",
            "action": f"Increase moisture by approximately {abs(moisture_diff):.2f}%"
        })
        status = "slightly_dry"
    elif moisture_content > omc * 1.1:
        recommendations.append({
            "type": "warning",
            "icon": "🔥",
            "title": "Dry the Soil",
            "message": f"Moisture content ({moisture_content:.2f}%) is significantly above OMC ({omc:.2f}%). Soil is too wet for optimal compaction.",
            "action": f"Reduce moisture by approximately {abs(moisture_diff):.2f}%"
        })
        status = "wet"
    elif moisture_content > omc:
        recommendations.append({
            "type": "info",
            "icon": "🔥",
            "title": "Slightly Wet",
            "message": f"Moisture content ({moisture_content:.2f}%) is slightly above OMC ({omc:.2f}%). Minor drying recommended.",
            "action": f"Reduce moisture by approximately {abs(moisture_diff):.2f}%"
        })
        status = "slightly_wet"

    # Dry density recommendations
    if density_ratio >= 97:
        recommendations.append({
            "type": "success",
            "icon": "✅",
            "title": "Proper Compaction Achieved",
            "message": f"Dry density ({dry_density:.4f} g/cm³) is near MDD ({mdd:.4f} g/cm³) at {density_ratio:.1f}%. Excellent compaction achieved!",
            "action": "Maintain current compaction effort"
        })
        status = "optimal"
    elif density_ratio >= 90:
        recommendations.append({
            "type": "info",
            "icon": "⚠️",
            "title": "Good Compaction",
            "message": f"Dry density is at {density_ratio:.1f}% of MDD. Good compaction, but improvement possible.",
            "action": "Increase compaction effort slightly"
        })
    else:
        recommendations.append({
            "type": "error",
            "icon": "❌",
            "title": "Insufficient Compaction",
            "message": f"Dry density ({dry_density:.4f} g/cm³) is only {density_ratio:.1f}% of MDD. Insufficient compaction.",
            "action": "Significantly increase compaction effort or adjust moisture content"
        })

    return recommendations, status


def process_soil_test(trials_data):
    """
    Process a complete soil test with multiple trials.
    trials_data: list of dicts with W1, W2, W3, wet_density, mold_volume
    Returns complete test results including OMC and MDD.
    """
    if not trials_data:
        raise ValueError("No trial data provided")

    processed_trials = []

    for i, trial in enumerate(trials_data):
        try:
            W1 = float(trial['W1'])
            W2 = float(trial['W2'])
            W3 = float(trial['W3'])
            wet_density = float(trial['wet_density'])

            # Calculate moisture content
            moisture_content = calculate_moisture_content(W1, W2, W3)

            # Calculate dry density
            dry_density = calculate_dry_density(wet_density, moisture_content)

            processed_trials.append({
                'trial_number': i + 1,
                'W1': W1,
                'W2': W2,
                'W3': W3,
                'wet_density': wet_density,
                'moisture_content': moisture_content,
                'dry_density': dry_density,
                'water_content_g': round(W2 - W3, 4),
                'dry_soil_g': round(W3 - W1, 4)
            })

        except (KeyError, TypeError, ValueError) as e:
            raise ValueError(f"Trial {i + 1} error: {str(e)}")

    # Find OMC and MDD
    omc, mdd, fit = find_omc_mdd(processed_trials)

    # Get recommendations for the overall test (using average moisture)
    avg_moisture = sum(t['moisture_content'] for t in processed_trials) / len(processed_trials)
    avg_density = sum(t['dry_density'] for t in processed_trials) / len(processed_trials)
    recommendations, status = get_compaction_recommendations(avg_moisture, omc, avg_density, mdd)

    return {
        'trials': processed_trials,
        'omc': omc,
        'mdd': mdd,
        'regression_fit': fit,
        'average_moisture_content': round(avg_moisture, 4),
        'average_dry_density': round(avg_density, 4),
        'recommendations': recommendations,
        'status': status,
        'trial_count': len(processed_trials)
    }


def validate_trial_input(trial_data):
    """Validate input data for a single trial."""
    errors = []
    required_fields = ['W1', 'W2', 'W3', 'wet_density']

    for field in required_fields:
        if field not in trial_data:
            errors.append(f"Missing field: {field}")
            continue
        try:
            val = float(trial_data[field])
            if val < 0:
                errors.append(f"{field} cannot be negative")
        except (TypeError, ValueError):
            errors.append(f"{field} must be a valid number")

    if not errors:
        try:
            W1 = float(trial_data['W1'])
            W2 = float(trial_data['W2'])
            W3 = float(trial_data['W3'])

            if W3 <= W1:
                errors.append("W3 must be greater than W1 (container + dry soil > empty container)")
            if W2 < W3:
                errors.append("W2 must be >= W3 (wet soil weight >= dry soil weight)")
            if W2 <= W1:
                errors.append("W2 must be greater than W1")

            # Realistic Soil Checks
            mc = ((W2 - W3) / (W3 - W1)) * 100
            if mc > 60:
                errors.append("Moisture content seems excessively high (>60%)")
            if mc < 0.1:
                errors.append("Moisture content is too low (<0.1%)")
        except (TypeError, ValueError, ZeroDivisionError):
            pass  # Already caught above

    return errors
