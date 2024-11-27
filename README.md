YugabyteDB Integration with Spring Boot Application

This guide provides steps to integrate a Spring Boot application with YugabyteDB. Once configured, the payload table will be created in your database, and the provided APIs will allow interaction with the data.

Prerequisites

	1.	Java
Ensure Java 17 or higher is installed:

	2.	YugabyteDB
Install YugabyteDB locally or on a server. Refer to the YugabyteDB Installation Guide.

	3.	Create a Database
Create a database (default: my_app):

CREATE DATABASE my_app;

Configuration

	1.	Database Connection
Update application.properties:

spring.datasource.url=jdbc:postgresql://127.0.0.1:5433/my_app
spring.datasource.username=your_db_username
spring.datasource.password=your_db_password

	2.	Run the Application
Build and run the Spring Boot application:

./mvnw spring-boot:run

The payload table will be created automatically.

API Endpoints

1. Create Payload

Insert a record using POST:

curl --location 'http://localhost:8080/payload' \
--header 'Content-Type: application/json' \
--data '{
  "messageId": "msg001",
  "transactionalId": "txn001",
  "action": "SEARCH",
  "payload": "{key: value1}",
  "bppId": "bpp001",
  "bapId": "bap001"
}'

2. Get All Payloads

Fetch all records using GET:

curl --location 'http://localhost:8080/payload'

Notes

	•	Replace my_app with your database name in application.properties.
	•	Ensure YugabyteDB is running before starting the application.
	•	Update the IP and port (127.0.0.1:5433) if connecting to a remote database.

With this setup, your application will be ready to use YugabyteDB! 🚀
