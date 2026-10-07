FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer libreoffice-calc fonts-liberation fonts-dejavu-core \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara poppler-utils \
    && rm -rf /var/lib/apt/lists/*
# Somali OCR model (not packaged in Debian)
ADD --chmod=644 https://github.com/tesseract-ocr/tessdata_fast/raw/main/som.traineddata /usr/share/tesseract-ocr/5/tessdata/som.traineddata
ENV NODE_ENV=production HOME=/tmp
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
USER node
EXPOSE 4000
CMD ["node", "src/server.js"]
