$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:5173/api/club'

function Invoke-ClubAction([string]$action, [hashtable]$payload) {
  $body = @{ action = $action; payload = $payload } | ConvertTo-Json -Depth 8
  Invoke-RestMethod -Uri $base -Method Post -ContentType 'application/json' -Body $body
}

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { throw "ASSERTION FAILED: $message" }
}

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString().Substring(5)
$first = Invoke-ClubAction 'member.create' @{
  name='接口测试甲'; gender='男'; major='26级软件工程'; studentId="2601$suffix"; phone='13800000001'; role='社员'; tag='进阶'; status='在社'
}
$second = Invoke-ClubAction 'member.create' @{
  name='接口测试乙'; gender='女'; major='26级金融'; studentId="2602$suffix"; phone='13800000002'; role='社员'; tag='新手'; status='在社'
}

$members = Invoke-RestMethod "$base`?view=members"
Assert-True (($members.members | Where-Object id -eq $first.id).Count -eq 1) '新增成员甲应可查询'
Assert-True (($members.members | Where-Object id -eq $second.id).Count -eq 1) '新增成员乙应可查询'

$undoMember = Invoke-ClubAction 'member.create' @{
  name='接口测试撤回'; gender='男'; major='26级测试'; studentId='待补充-999'; phone='13800000003'; role='社员'; tag='新手'; status='在社'
}
$logsForUndo = Invoke-RestMethod "$base`?view=logs"
$undoLog = $logsForUndo.logs | Where-Object target_id -eq $undoMember.id | Select-Object -First 1
Assert-True ($null -ne $undoLog) '新增成员操作应产生日志'
Invoke-ClubAction 'operation.undo' @{ logId=$undoLog.id } | Out-Null
$membersAfterUndo = Invoke-RestMethod "$base`?view=members"
Assert-True (($membersAfterUndo.members | Where-Object id -eq $undoMember.id).Count -eq 0) '撤回新增成员后数据库中不应保留该成员'
$logsAfterUndo = Invoke-RestMethod "$base`?view=logs"
Assert-True (($logsAfterUndo.logs | Where-Object id -eq $undoLog.id).Count -eq 1) '撤回后应保留原操作日志'
Assert-True (($logsAfterUndo.logs | Where-Object action -eq '撤回操作').Count -ge 1) '撤回行为本身应写入审计日志'

Invoke-ClubAction 'member.update' @{
  id=$first.id; name='接口测试甲改'; gender='男'; major='26级软件工程'; studentId="2601$suffix"; phone='13800000009'; role='社员'; tag='高手'; status='在社'
} | Out-Null
$members = Invoke-RestMethod "$base`?view=members"
Assert-True (($members.members | Where-Object id -eq $first.id).name -eq '接口测试甲改') '修改成员应生效'

$tournament = Invoke-ClubAction 'tournament.create' @{
  name='接口自动化测试赛'; game='中式八球'; format='单败'; teamMode='单打'; bestOf=3; roundBestOf=@(3); handicap='不让球'; startsAt='2026-10-15T19:00'; location='测试球室'; participantIds=@($first.id,$second.id)
}
Invoke-ClubAction 'tournament.update' @{
  id=$tournament.id; name='接口自动化测试赛（已修改）'; game='九球'; bestOf=3; roundBestOf=@(5); handicap='不让球'; startsAt='2026-10-15T20:00'; location='修改后测试球室'; winnerPoints=7; loserPoints=2
} | Out-Null
$tournamentsAfterUpdate = Invoke-RestMethod "$base`?view=tournaments"
$updatedTournament = $tournamentsAfterUpdate.tournaments | Where-Object id -eq $tournament.id
Assert-True ($updatedTournament.name -eq '接口自动化测试赛（已修改）') '比赛名称应可修改'
Assert-True ($updatedTournament.game -eq '九球') '比赛项目应可修改'
Invoke-ClubAction 'tournament.generate' @{ tournamentId=$tournament.id } | Out-Null
$matches = Invoke-RestMethod "$base`?view=matches&tournamentId=$($tournament.id)"
$ready = $matches.matches | Where-Object { $_.player1_id -and $_.player2_id } | Select-Object -First 1
Assert-True ($null -ne $ready) '签表应产生可比赛对阵'
Assert-True ($ready.best_of -eq 5) '每轮应使用独立设置的局制'
Invoke-ClubAction 'match.result' @{ matchId=$ready.id; player1Score=3; player2Score=1 } | Out-Null
Invoke-ClubAction 'match.result.update' @{ matchId=$ready.id; player1Score=3; player2Score=0 } | Out-Null
$matchesAfterEdit = Invoke-RestMethod "$base`?view=matches&tournamentId=$($tournament.id)"
$editedMatch = $matchesAfterEdit.matches | Where-Object id -eq $ready.id
Assert-True ($editedMatch.player1_score -eq 3 -and $editedMatch.player2_score -eq 0) '已结束场次比分应可修改'

$challenge = Invoke-ClubAction 'challenge.create' @{
  challengerId=$ready.player1_id; opponentId=$ready.player2_id; game='中式八球'; bestOf=3; handicap='不让球'; playedAt='2026-10-16T19:00'; location='测试球室'; winnerPoints=5; loserPoints=0
}
Invoke-ClubAction 'challenge.accept' @{ id=$challenge.id; accept=$true } | Out-Null
$challengeLogs = Invoke-RestMethod "$base`?view=logs"
Assert-True (($challengeLogs.logs | Where-Object { $_.target_id -eq $challenge.id -and $_.action -eq '接受约战' }).Count -eq 1) '接受约战应写入可撤回日志'
Invoke-ClubAction 'challenge.submit' @{ id=$challenge.id; challengerScore=2; opponentScore=1 } | Out-Null
Invoke-ClubAction 'challenge.confirm' @{ id=$challenge.id } | Out-Null
Invoke-ClubAction 'challenge.approve' @{ id=$challenge.id } | Out-Null
$leaders = Invoke-RestMethod "$base`?view=leaderboard"
$winner = $leaders.leaderboard | Where-Object id -eq $ready.player1_id
Assert-True ($winner.points -eq 12) '正式比赛获胜7分、约战获胜5分，应累计12分'
Assert-True ($winner.elo -gt 1500) '约战胜者Elo应增加'

$double = Invoke-ClubAction 'tournament.create' @{
  name='接口双败测试赛'; game='中式八球'; format='双败'; teamMode='单打'; bestOf=3; handicap='不让球'; startsAt='2026-10-17T19:00'; location='测试球室'; participantIds=@($first.id,$second.id)
}
Invoke-ClubAction 'tournament.generate' @{ tournamentId=$double.id } | Out-Null
$doubleMatches = Invoke-RestMethod "$base`?view=matches&tournamentId=$($double.id)"
$upperFinal = $doubleMatches.matches | Where-Object { $_.bracket -eq '胜者组' -and $_.player1_id -and $_.player2_id } | Select-Object -First 1
Invoke-ClubAction 'match.result' @{ matchId=$upperFinal.id; player1Score=2; player2Score=0 } | Out-Null
$doubleMatches = Invoke-RestMethod "$base`?view=matches&tournamentId=$($double.id)"
Assert-True (($doubleMatches.matches | Where-Object bracket -eq '总决赛').Count -eq 1) '双败两人赛应在胜者组后生成总决赛'
Invoke-ClubAction 'tournament.delete' @{ id=$double.id } | Out-Null
$tournamentsAfterDelete = Invoke-RestMethod "$base`?view=tournaments"
Assert-True (($tournamentsAfterDelete.tournaments | Where-Object id -eq $double.id).Count -eq 0) '比赛应可删除'

$logs = Invoke-RestMethod "$base`?view=logs"
Assert-True (($logs.logs | Where-Object target_id -eq $challenge.id).Count -gt 0) '约战审核应写入日志'
$backup = Invoke-RestMethod "$base`?view=backup"
Assert-True ($backup.version -eq 1) '备份应包含版本号'

Invoke-ClubAction 'member.delete' @{ id=$second.id } | Out-Null
$members = Invoke-RestMethod "$base`?view=members"
Assert-True (($members.members | Where-Object id -eq $second.id).Count -eq 0) '删除成员后不应出现在成员列表'
$afterDeleteBackup = Invoke-RestMethod "$base`?view=backup"
Assert-True (($afterDeleteBackup.data.members | Where-Object id -eq $second.id).Count -eq 1) '归档成员后数据库备份中仍应保留成员档案'
$archived = Invoke-RestMethod "$base`?view=members&includeArchived=1"
Assert-True (($archived.members | Where-Object id -eq $second.id).deleted_at.Length -gt 0) '归档成员应保留并标记归档时间'

Invoke-ClubAction 'backup.restore' @{ backup=$backup } | Out-Null
$members = Invoke-RestMethod "$base`?view=members"
Assert-True (($members.members | Where-Object id -eq $second.id).Count -eq 1) '恢复备份后被删除成员应恢复'

Write-Output "API_INTEGRATION_OK tournament=$($tournament.id) challenge=$($challenge.id)"
