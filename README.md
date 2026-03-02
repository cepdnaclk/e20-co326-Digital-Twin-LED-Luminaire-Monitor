# Measuring Light Intensity in a Company Before It Dies

This project uses Docker Compose to run the monitoring stack:

- InfluxDB (time-series database)
- Grafana (dashboard/visualization)
- Node-RED (flow-based processing)

## Prerequisites

- Docker Desktop installed and running
- Docker Compose plugin available (`docker compose`)

## How to Run the Containers

1. Open a terminal in the project root.
2. Move to the `docker` folder:

   ```powershell
   cd docker
   ```

3. Start all containers in detached mode:

   ```powershell
   docker compose up -d
   ```

4. Verify running containers:

   ```powershell
   docker compose ps
   ```

## Service URLs

- Grafana: http://localhost:3000
  - Username: `admin`
  - Password: `admin`
- Node-RED: http://localhost:1880
- InfluxDB: http://localhost:8086
  - Username: `root`
  - Password: `rootpassword`
  - Organization: `light_org`
  - Bucket: `light_data`

## Useful Commands

- View logs:

  ```powershell
  docker compose logs -f
  ```

- Stop containers:

  ```powershell
  docker compose down
  ```

- Stop and remove volumes (this deletes InfluxDB data):

  ```powershell
  docker compose down -v
  ```

## Notes

- If a container does not start, check logs with `docker compose logs <service-name>`.
- If ports `3000`, `1880`, or `8086` are already in use, stop the conflicting process or change the port mappings in `docker/docker-compose.yml`.
- InfluxDB is configured as 2.x with initial setup enabled. Admin token is `root-token`.
