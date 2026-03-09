@echo off
cd /d "C:\Users\xfg1\Desktop\Hamin Kim\reverse-ant-web"

echo [%date% %time%] Starting generate_watchlist.py >> scripts\watchlist_log.txt
py -3 scripts\generate_watchlist.py >> scripts\watchlist_log.txt 2>&1
echo [%date% %time%] Done >> scripts\watchlist_log.txt
