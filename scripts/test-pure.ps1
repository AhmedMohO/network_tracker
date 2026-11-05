param([Parameter(Mandatory=$true)][string[]]$Sources, [Parameter(Mandatory=$true)][string[]]$Tests)
$ErrorActionPreference = 'Stop'
$reviewCache = Join-Path $env:USERPROFILE '.gradle/caches/modules-2/files-2.1'
function Find-ReviewJar([string]$part) {
    $found = Get-ChildItem -LiteralPath (Join-Path $reviewCache $part) -Recurse -Filter '*.jar' -File | Select-Object -First 1
    if (!$found) { throw "Required cached test dependency is missing: $part" }
    return $found.FullName
}
$stdlib = Find-ReviewJar 'org.jetbrains.kotlin/kotlin-stdlib/2.1.20'
$junit = Find-ReviewJar 'junit/junit/4.13.2'
$hamcrest = Find-ReviewJar 'org.hamcrest/hamcrest-core/1.3'
$json = Find-ReviewJar 'org.json/json/20180813'
$compilerCp = @(
    (Find-ReviewJar 'org.jetbrains.kotlin/kotlin-compiler-embeddable/2.1.20'),
    $stdlib,
    (Find-ReviewJar 'org.jetbrains.intellij.deps/trove4j/1.0.20200330'),
    (Find-ReviewJar 'org.jetbrains.kotlinx/kotlinx-coroutines-core-jvm/1.8.0'),
    (Find-ReviewJar 'org.jetbrains/annotations/23.0.0')
) -join ';'
$testCp = @($stdlib,$junit,$hamcrest,$json) -join ';'
$testOutput = Join-Path $PSScriptRoot ('../app/build/pure-tests/' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $testOutput | Out-Null
$reviewJava = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { 'java.exe' }
& $reviewJava -cp $compilerCp org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-stdlib -no-reflect -jvm-target 17 -classpath $testCp -d $testOutput @Sources
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $reviewJava -cp ($testOutput + ';' + $testCp) org.junit.runner.JUnitCore @Tests
exit $LASTEXITCODE
