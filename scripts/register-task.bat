@echo off
schtasks /create /tn "PokemonChampions_DailyPipeline" /tr "c:\Pokemon\scripts\daily-pipeline.bat" /sc daily /st 05:00 /f
echo Done. Task registered: PokemonChampions_DailyPipeline (daily at 05:00)
pause
