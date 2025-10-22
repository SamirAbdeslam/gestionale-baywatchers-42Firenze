FROM python:3.10.19-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl tzdata

ENV TZ=Europe/Rome
RUN ln -sf /usr/share/zoneinfo/Europe/Rome /etc/localtime && \
    echo "Europe/Rome" > /etc/timezone

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
COPY templates ./templates
COPY static ./static

EXPOSE 5000

VOLUME [ "/app/calendar_data" ]

# Health check - check every 30s, timeout 10s, start after 40s, max 3 retries
# Use HTTP for internal health check (localhost only, no security concern)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
#     CMD curl -f http://localhost:5000/health || exit 1

CMD ["python", "app.py"]