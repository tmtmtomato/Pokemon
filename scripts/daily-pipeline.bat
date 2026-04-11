@echo off
REM Daily Pipeline for Pokemon Champions
REM Called by Windows Task Scheduler

cd /d "c:\Pokemon"
call npm run pipeline 2>&1
