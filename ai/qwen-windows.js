// Pasted into Windows PowerShell on the author's own computer.
export function qwenSetupCommand(origin){
  const site=new URL(origin).origin.replaceAll("'","''");
  return String.raw`& {
  $ErrorActionPreference = 'Stop'
  $site = '${site}'
  $model = 'qwen3:4b-instruct'
  $api = 'http://127.0.0.1:11434'
  $previousHost = $env:OLLAMA_HOST
  try {
    $env:OLLAMA_HOST = '127.0.0.1:11434'
    $saved = [Environment]::GetEnvironmentVariable('OLLAMA_ORIGINS','User')
    $origins = @(($env:OLLAMA_ORIGINS + ',' + $saved + ',' + $site).Split(',') | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -Unique)
    $env:OLLAMA_ORIGINS = $origins -join ','
    if ($saved -ne $env:OLLAMA_ORIGINS) {
      [Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS',$env:OLLAMA_ORIGINS,'User')
    }

    function Find-Ollama {
      $cli = Get-Command ollama.exe -ErrorAction SilentlyContinue
      if ($cli) { return $cli.Source }
      $installed = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
      if (Test-Path -LiteralPath $installed) { return $installed }
    }
    $ollama = Find-Ollama
    if (!$ollama) {
      if (!(Get-Command winget.exe -ErrorAction SilentlyContinue)) {
        Start-Process 'https://ollama.com/download/windows'
        throw 'Установи Ollama с открывшейся официальной страницы и запусти эту команду снова.'
      }
      winget.exe install --exact --id Ollama.Ollama --source winget --accept-source-agreements --accept-package-agreements
      $ollama = Find-Ollama
      if (!$ollama) { throw 'Установка Ollama не завершилась. Проверь сообщение установщика выше.' }
    }

    function Server-Ready {
      try { return [bool](Invoke-RestMethod "$api/api/version" -TimeoutSec 2).version } catch { return $false }
    }
    function Site-Allowed {
      try {
        $tags = Invoke-WebRequest "$api/api/tags" -UseBasicParsing -Headers @{Origin=$site} -TimeoutSec 5
        return $tags.Headers['Access-Control-Allow-Origin'] -in @('*',$site)
      } catch { return $false }
    }
    if ((Server-Ready) -and !(Site-Allowed)) {
      Read-Host 'Заверши Ollama через её значок рядом с часами (Quit), затем нажми Enter'
    }
    if (!(Server-Ready)) {
      $tray = Join-Path (Split-Path $ollama) 'ollama app.exe'
      if (Test-Path -LiteralPath $tray) { Start-Process -FilePath $tray }
      else { Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Minimized }
      for ($i=0; $i -lt 30 -and !(Server-Ready); $i++) { Start-Sleep -Seconds 1 }
    }
    if (!(Site-Allowed)) { throw 'Ollama пока не разрешила доступ Freitag. Полностью заверши Ollama и повтори команду.' }
    $tags = Invoke-RestMethod "$api/api/tags" -TimeoutSec 10
    if ($model -notin @($tags.models.name)) {
      & $ollama pull $model
      if ($LASTEXITCODE -ne 0) { throw 'Загрузка Qwen прервалась. Повтори команду, чтобы продолжить.' }
    }
    Write-Host 'Проверяю первый локальный ответ Qwen…'
    $body = @{model=$model;stream=$false;messages=@(@{role='user';content='Reply OK.'});options=@{num_predict=12}} | ConvertTo-Json -Depth 5
    $reply = Invoke-RestMethod "$api/api/chat" -Method Post -ContentType 'application/json' -Body $body -Headers @{Origin=$site} -TimeoutSec 300
    if (![string]::IsNullOrWhiteSpace($reply.message.content)) {
      Write-Host ('Qwen ответила: ' + $reply.message.content)
      Write-Host 'Готово. В новом чате Freitag выбери «Qwen · локально».'
    } else { throw 'От модели пришёл пустой ответ.' }
  } catch { Write-Host $_.Exception.Message -ForegroundColor Red }
  finally { $env:OLLAMA_HOST = $previousHost }
}`;
}
