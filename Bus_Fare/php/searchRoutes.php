<?php
require_once __DIR__ . './db_connection.php';
header('Content-Type: application/json');
error_reporting(E_ALL);
ini_set('display_errors', 1);

if (!isset($_GET['origin']) || !isset($_GET['destination'])) {
    echo json_encode(['error' => 'Origin and Destination are required.']);
    exit;
}

$origin = trim($_GET['origin']);
$destination = trim($_GET['destination']);

// Normalize route numbers by stripping leading zeros from segments
function normalizeRouteNo($routeNo) {
    $parts = preg_split('/[-\/]/', $routeNo);
    $parts = array_map(fn($p) => ltrim($p, '0'), $parts);
    return implode('/', $parts);
}

function findNearestSection($pdo, $routeNo, $currentSectionId, $direction, $relativeTo, $serviceType) {
    $isOrigin = $relativeTo === 'origin';
    $isUp = $direction === 'up';

    $comparison = ($isOrigin && $isUp) || (!$isOrigin && !$isUp) ? "< :sectionId" : "> :sectionId";
    $order = ($comparison === "< :sectionId") ? "DESC" : "ASC";

    $query = "SELECT section_id, service_type, section_name FROM all_section 
              WHERE route_no = :routeNo AND section_id $comparison 
              AND service_type LIKE :serviceType 
              ORDER BY section_id $order LIMIT 1";

    $stmt = $pdo->prepare($query);
    $stmt->execute([
        'routeNo' => $routeNo,
        'sectionId' => $currentSectionId,
        'serviceType' => "%$serviceType%"
    ]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function hasServiceType($serviceTypeStr, $typeToCheck) {
    $types = explode(',', $serviceTypeStr);
    foreach ($types as $t) {
        if (trim($t) === $typeToCheck) return true;
    }
    return false;
}

function getAvailableServiceTypes($pdo, $routeNo) {
    $query = "SELECT DISTINCT service_type FROM all_section WHERE route_no = :routeNo";
    $stmt = $pdo->prepare($query);
    $stmt->execute(['routeNo' => $routeNo]);
    $results = $stmt->fetchAll(PDO::FETCH_COLUMN);

    $types = [];
    foreach ($results as $entry) {
        foreach (explode(',', $entry) as $type) {
            $types[] = trim($type);
        }
    }
    return array_unique($types);
}

function getServiceTypeDisplay($serviceType) {
    return (str_contains($serviceType, 'SL') || str_contains($serviceType, 'LX')) ? 'ac or semi' : 'normal';
}

function resolveRouteName($pdo, $routeNo, $originName, $destinationName, &$matchedBy) {
    $normalized = normalizeRouteNo($routeNo);

    // Load all routes for matching
    $stmt = $pdo->prepare("SELECT Route_No, Origin, Destination FROM allroutes");
    $stmt->execute();
    $routes = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($routes as $row) {
        $normalizedDbRoute = normalizeRouteNo($row['Route_No']);
        if ($normalized === $normalizedDbRoute) {
            $matchedBy = 'exact';
            return $row['Origin'] . ' - ' . $row['Destination'];
        }
    }

    // Fallback: match on origin and destination
    $stmt = $pdo->prepare("SELECT CONCAT(Origin, ' - ', Destination) FROM allroutes 
                           WHERE Origin = :origin AND Destination = :destination");
    $stmt->execute(['origin' => $originName, 'destination' => $destinationName]);
    $result = $stmt->fetch(PDO::FETCH_COLUMN);
    if ($result) {
        $matchedBy = 'origin_destination';
        return $result;
    }

    $matchedBy = 'unknown';
    return 'Unknown';
}

try {
    $pdo = new PDO($dsn, $username, $password, $options);

    $query = "SELECT DISTINCT route_no FROM all_section 
              WHERE section_name = :origin 
              AND route_no IN (SELECT route_no FROM all_section WHERE section_name = :destination)";
    $stmt = $pdo->prepare($query);
    $stmt->execute(['origin' => $origin, 'destination' => $destination]);
    $routes = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (!$routes) {
        echo json_encode(['error' => 'No routes found for the given locations.']);
        exit;
    }

    $fareResults = [];

    foreach ($routes as $routeNo) {
        $query = "SELECT section_id, service_type, section_name FROM all_section 
                  WHERE section_name = :name AND route_no = :routeNo";
        $stmt = $pdo->prepare($query);

        $stmt->execute(['name' => $origin, 'routeNo' => $routeNo]);
        $originSection = $stmt->fetch(PDO::FETCH_ASSOC);

        $stmt->execute(['name' => $destination, 'routeNo' => $routeNo]);
        $destinationSection = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$originSection || !$destinationSection) continue;

        $direction = $originSection['section_id'] < $destinationSection['section_id'] ? 'up' : 'down';

        $sectionDiffNormal = abs($destinationSection['section_id'] - $originSection['section_id']);
        $stmt = $pdo->prepare("SELECT normal FROM fare_stages WHERE fare_stage = :diff");
        $stmt->execute(['diff' => $sectionDiffNormal]);
        $normalFare = $stmt->fetch(PDO::FETCH_ASSOC)['normal'] ?? null;

        $availableServices = getAvailableServiceTypes($pdo, $routeNo);

        $semi = null;
        $ac = null;
        $originNearestSection = $originSection;
        $destinationNearestSection = $destinationSection;

        foreach (['SL', 'LX'] as $type) {
            if (!in_array($type, $availableServices)) continue;

            $nearOrigin = hasServiceType($originSection['service_type'], $type)
                ? $originSection
                : findNearestSection($pdo, $routeNo, $originSection['section_id'], $direction, 'origin', $type);

            $nearDestination = hasServiceType($destinationSection['service_type'], $type)
                ? $destinationSection
                : findNearestSection($pdo, $routeNo, $destinationSection['section_id'], $direction, 'destination', $type);

            if ($nearOrigin && $nearDestination) {
                $sectionDiff = abs($nearDestination['section_id'] - $nearOrigin['section_id']);
                $stmt = $pdo->prepare("SELECT semi, ac FROM fare_stages WHERE fare_stage = :diff");
                $stmt->execute(['diff' => $sectionDiff]);
                $fareData = $stmt->fetch(PDO::FETCH_ASSOC);

                if ($type === 'SL' && isset($fareData['semi'])) {
                    $semi = $fareData['semi'];
                    $originNearestSection = $nearOrigin;
                    $destinationNearestSection = $nearDestination;
                }

                if ($type === 'LX' && isset($fareData['ac'])) {
                    $ac = $fareData['ac'];
                    $originNearestSection = $nearOrigin;
                    $destinationNearestSection = $nearDestination;
                }
            }
        }

        $matchedBy = 'unknown';
        $routeName = resolveRouteName(
            $pdo,
            $routeNo,
            $originSection['section_name'],
            $destinationSection['section_name'],
            $matchedBy
        );

        $fareEntry = [
            'route_no' => $routeNo,
            'route_name' => $routeName,
            'matched_by' => $matchedBy,
            'service_type' => getServiceTypeDisplay($originSection['service_type']),
            'origin_nearest_section_id' => $originNearestSection['section_id'],
            'destination_nearest_section_id' => $destinationNearestSection['section_id'],
        ];

        if (!empty($normalFare)) $fareEntry['normal'] = $normalFare;
        if (!empty($semi)) $fareEntry['semi'] = $semi;
        if (!empty($ac)) $fareEntry['ac'] = $ac;

        $fareResults[] = $fareEntry;
    }

    echo json_encode($fareResults);

} catch (PDOException $e) {
    error_log('PDOException: ' . $e->getMessage());
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
