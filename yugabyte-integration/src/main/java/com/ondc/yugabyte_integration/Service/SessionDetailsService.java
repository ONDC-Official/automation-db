package com.ondc.yugabyte_integration.Service;

import com.ondc.yugabyte_integration.Entity.SessionDetails;
import com.ondc.yugabyte_integration.Repository.SessionDetailsRepository;
import jakarta.transaction.Transactional;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.Optional;

@Service
public class SessionDetailsService {

    private final SessionDetailsRepository sessionDetailsRepository;

    public SessionDetailsService(SessionDetailsRepository sessionDetailsRepository) {
        this.sessionDetailsRepository = sessionDetailsRepository;
    }

    public List<SessionDetails> getAllSessions() {
        return sessionDetailsRepository.findAll();
    }

    public Optional<SessionDetails> getSessionById(String sessionId) {
        return sessionDetailsRepository.findById(sessionId);
    }

    public boolean checkSessionById(String sessionId) {
        return sessionDetailsRepository.existsById(sessionId);
    }

    @Transactional
    public SessionDetails createSession(SessionDetails sessionDetails) {
        return sessionDetailsRepository.save(sessionDetails);
    }

    public SessionDetails updateSession(String sessionId, SessionDetails updatedDetails) {
        return sessionDetailsRepository.findById(sessionId)
                .map(existingSession -> {
                    existingSession.setNpType(updatedDetails.getNpType());
                    existingSession.setNpId(updatedDetails.getNpId());
                    existingSession.setDomain(updatedDetails.getDomain());
                    return sessionDetailsRepository.save(existingSession);
                })
                .orElseThrow(() -> new RuntimeException("Session not found with id: " + sessionId));
    }

    public void deleteSession(String sessionId) {
        sessionDetailsRepository.deleteById(sessionId);
    }

//    public Optional<SessionDetails> getSessionWithPayloads(String sessionId) {
//        return sessionDetailsRepository.findById(sessionId);
//    }

    public Optional<SessionDetails> getSessionWithPayloads(String sessionId) {
        return sessionDetailsRepository.findWithPayloadsBySessionId(sessionId);
    }
}
