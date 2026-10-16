FROM python:alpine

WORKDIR /app

RUN pip install flask gitpython

COPY deploy.py .

CMD ["python", "deploy.py"]
