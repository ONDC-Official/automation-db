package com.ondc.yugabyte_integration.Repository;

import com.ondc.yugabyte_integration.Entity.SessionDetails;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SessionDetailsRepository extends JpaRepository<SessionDetails, String> {

    Optional<SessionDetails> findBySessionId(String sessionId);

    @EntityGraph(attributePaths = {"payloads"})
    Optional<SessionDetails> findWithPayloadsBySessionId(String sessionId);

}
