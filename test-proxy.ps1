# Тест прокси
$body = @{
    method = "GET"
    url = "http://host.docker.internal:8081/sse"
} | ConvertTo-Json

Write-Host "Тестирование SSE через прокси..."
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3002/proxy" -Method POST -ContentType "application/json" -Body $body
    Write-Host "Ответ прокси:"
    Write-Host $response
} catch {
    Write-Host "Ошибка: $($_.Exception.Message)"
}

Write-Host "`nТестирование JSON через прокси..."
$jsonBody = @{
    method = "POST"
    url = "http://host.docker.internal:8081/json"
    headers = @{
        Accept = "application/json"
    }
    body = @{
        ping = "pong"
    }
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3002/proxy" -Method POST -ContentType "application/json" -Body $jsonBody
    Write-Host "Ответ прокси:"
    Write-Host ($response | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "Ошибка: $($_.Exception.Message)"
}
