package com.ondc.yugabyte_integration.Repository;

import com.ondc.yugabyte_integration.Entity.Payload;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface PayloadRepository extends JpaRepository<Payload, Long> {

    List<Payload> findByTransactionId(String transactionId);
    List<Payload> findByPayloadId(String payloadId);
    List<Payload> findBySessionDetailsSessionId(String sessionId);

}
