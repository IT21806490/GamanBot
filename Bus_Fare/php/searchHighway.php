<?php
require_once __DIR__ . './db_connection.php';
header('Content-Type: application/json');
error_reporting(E_ALL);
ini_set('display_errors', 1);

/* ---------- helper functions ---------- */
function normalizeRoute(string $routeNo): string {
    $routeNo = strtoupper(trim($routeNo));
    $routeNo = preg_replace('/[\s\-\/]+/', '-', $routeNo);
    $parts   = explode('-', $routeNo);
    $suffix  = '';
    if ($parts && !ctype_digit(end($parts))) {
        $suffix = array_pop($parts);
    }
    $parts = array_map(
        fn($p) => ctype_digit($p) ? (ltrim($p, '0') ?: '0') : $p,
        $parts
    );
    if ($suffix !== '') {
        $parts[] = $suffix;
    }
    return implode('-', $parts);
}

function resolveRouteName(PDO $pdo, string $routeNo): string {
    $stmt = $pdo->prepare("
        SELECT Origin, Destination
          FROM allroutes
         WHERE UPPER(Route_No) = :rno
         LIMIT 1");
    $stmt->execute([':rno' => strtoupper($routeNo)]);
    if ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        return "{$row['Origin']} → {$row['Destination']}";
    }

    /* fallback by normalised comparison */
    $norm = normalizeRoute($routeNo);
    $stmt = $pdo->query("SELECT Route_No, Origin, Destination FROM allroutes");
    while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
        if (normalizeRoute($r['Route_No']) === $norm) {
            return "{$r['Origin']} → {$r['Destination']}";
        }
    }
    return 'Unknown Route';
}
/* ---------- /helpers ---------- */

$origin      = strtoupper(trim($_GET['origin']      ?? ''));
$destination = strtoupper(trim($_GET['destination'] ?? ''));

if (!$origin || !$destination) {
    echo json_encode(['error' => 'Origin and Destination are required.']);
    exit;
}

try {
    $pdo = new PDO($dsn, $username, $password, $options);

    /* 1️⃣  find every route that contains BOTH towns (exact, then LIKE) */
    $baseSQL = "
        SELECT DISTINCT route_no
          FROM highway_section
         WHERE %s
           AND route_no IN (
                 SELECT route_no FROM highway_section WHERE %s
             )";

    $stmt = $pdo->prepare(sprintf($baseSQL,
        "UPPER(section_name) = :origin",
        "UPPER(section_name) = :destination"));
    $stmt->execute(['origin' => $origin, 'destination' => $destination]);
    $routeNos = $stmt->fetchAll(PDO::FETCH_COLUMN);

    if (empty($routeNos)) {
        $stmt = $pdo->prepare(sprintf($baseSQL,
            "section_name LIKE :origin",
            "section_name LIKE :destination"));
        $stmt->execute([
            'origin'      => "%$origin%",
            'destination' => "%$destination%"
        ]);
        $routeNos = $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    if (empty($routeNos)) {
        echo json_encode(['error' => '🚫 No results found.']);
        exit;
    }

    /* 2️⃣  prepare statements */
    $typesStmt = $pdo->prepare("
        SELECT DISTINCT service_type
          FROM highway_section
         WHERE route_no = :rno
           AND service_type IS NOT NULL
           AND service_type <> ''");

    $fareStmt = $pdo->prepare("
        SELECT section_name, fare
          FROM highway_section
         WHERE route_no      = :rno
           AND service_type  = :stype
           AND (UPPER(section_name) = :origin
                OR UPPER(section_name) = :destination)");

    /* 3️⃣  build results – one object per (route_no, service_type) */
    $results = [];

    foreach ($routeNos as $rno) {
        /* get every service type for this route_no */
        $typesStmt->execute(['rno' => $rno]);
        $types = array_unique(array_filter($typesStmt->fetchAll(PDO::FETCH_COLUMN)));

        if (empty($types)) {                 // still add at least one placeholder
            $types = ['Unknown'];
        }

        foreach ($types as $stype) {
            /* fetch fares for this service type */
            $fareStmt->execute([
                'rno'       => $rno,
                'stype'     => $stype,
                'origin'    => $origin,
                'destination'=> $destination
            ]);
            $rows = $fareStmt->fetchAll(PDO::FETCH_KEY_PAIR);

            /* skip if either fare missing */
            if (!isset($rows[$origin]) || !isset($rows[$destination])) {
                continue;
            }

            $fare = abs(floatval($rows[$destination]) - floatval($rows[$origin]));

            $results[] = [
                'route_no'     => $rno,
                'route_name'   => resolveRouteName($pdo, $rno),
                'origin'       => $origin,
                'destination'  => $destination,
                'highway'      => number_format($fare, 2),
                'service_type' => ($stype === 'SUPER') ? 'SUPER LUXURY' : $stype
            ];

        }
    }

    if (empty($results)) {
        echo json_encode(['error' => 'Fare data missing on matching routes.']);
        exit;
    }

    echo json_encode(['routes' => $results], JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    echo json_encode(['error' => 'Database error: ' . $e->getMessage()]);
}
