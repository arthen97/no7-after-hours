FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY salon_server.py laya_decider.py ./
COPY production/merouter_media.py ./production/merouter_media.py
COPY production/laya-v3/questions.json ./production/laya-v3/questions.json
COPY public ./public
ENV BIND_HOST=0.0.0.0 PORT=4328
EXPOSE 4328
CMD ["python3", "salon_server.py"]
