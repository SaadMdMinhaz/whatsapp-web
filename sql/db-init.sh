#!/bin/bash
set -e

for i in $(seq 1 30); do
  if /opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -No -Q "SELECT 1" >/dev/null 2>&1; then
    echo "SQL Server reachable, running init.sql"
    /opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -P "$MSSQL_SA_PASSWORD" -C -No -i /sql/init.sql
    echo "DB init completed"
    exit 0
  fi
  echo "waiting for SQL Server (attempt $i)..."
  sleep 5
done

echo "SQL Server never became reachable"
exit 1
