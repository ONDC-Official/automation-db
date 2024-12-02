# Step 1: Build the application
FROM maven:3.9.0-eclipse-temurin-17 AS builder

ARG DB_URL
ARG DB_PASSWORD


# Set the working directory
WORKDIR /app

# Copy the source code and pom.xml into the container
COPY . .

WORKDIR /app/yugabyte-integration

# Build the application and package it into a .jar file
RUN mvn clean package

# Step 2: Use a lightweight image to run the application
FROM openjdk:17-jdk-slim

# Set the working directory for the runtime container
WORKDIR /app/yugabyte-integration

# Copy the built JAR from the builder stage
COPY --from=builder /app/yugabyte-integration/target/yugabyte-integration-0.0.1-SNAPSHOT.jar app.jar

# Expose the application's port
EXPOSE 8080

# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
