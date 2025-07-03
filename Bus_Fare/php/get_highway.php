<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/db_connection.php';

header('Content-Type: application/json');

try {
    $pdo = new PDO($dsn, $username, $password, $options);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Fetch unique section names
    $query = "SELECT DISTINCT section_name FROM highway_section WHERE section_name IS NOT NULL AND section_name != '' ORDER BY section_name ASC";
    $stmt = $pdo->prepare($query);
    $stmt->execute();
    $sections = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // Wrap the response inside an object
    echo json_encode(["sections" => $sections], JSON_PRETTY_PRINT);

} catch (PDOException $e) {
    echo json_encode(["error" => "Database error: " . $e->getMessage()]);
    exit;
}
?>
