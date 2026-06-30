#!/bin/bash
cd ~/freight-empire
curl -L -o data/zhvi_county.csv "https://files.zillowstatic.com/research/public_csvs/zhvi/County_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"
node scripts/build_land_values.js
pm2 restart freight-empire
echo "$(date): Land values updated" >> logs/land_value_updates.log
