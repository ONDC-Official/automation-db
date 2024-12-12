package com.ondc.yugabyte_integration.Controller;

import com.ondc.yugabyte_integration.Entity.Payload;
import com.ondc.yugabyte_integration.Entity.SessionDetails;
import com.ondc.yugabyte_integration.Repository.PayloadRepository;
import com.ondc.yugabyte_integration.Repository.SessionDetailsRepository;
import com.ondc.yugabyte_integration.Service.SessionDetailsService;
import jakarta.transaction.Transactional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/sessions")
public class SessionDetailsController {

    private final SessionDetailsService sessionDetailsService;

    @Autowired
    private PayloadRepository payloadRepository;

    @Autowired
    private SessionDetailsRepository sdRepository;

    public SessionDetailsController(SessionDetailsService sessionDetailsService) {
        this.sessionDetailsService = sessionDetailsService;
    }

    @GetMapping
    public List<SessionDetails> getAllSessions() {
        return sessionDetailsService.getAllSessions();
    }

    @GetMapping("/{sessionId}")
    public ResponseEntity<SessionDetails> getSessionById(@PathVariable String sessionId) {
        return sessionDetailsService.getSessionById(sessionId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/check/{sessionId}")
    public boolean checkSessionById(@PathVariable String sessionId) {
        return sessionDetailsService.checkSessionById(sessionId);
    }

    @Transactional
    @PostMapping("/payload")
    public ResponseEntity<SessionDetails> createPayload(@RequestBody Payload payload) {
        SessionDetails sessionDetails = sdRepository.findBySessionId(payload.getSessionDetails().getSessionId())
                .orElseThrow(() -> new RuntimeException("SessionDetails not found for sessionId: " + payload.getSessionDetails().getSessionId()));

        List<Payload> payloadList = sessionDetails.getPayloads();
        System.out.println("Payload list - " + payloadList);
        payloadList.add(payload);
        sessionDetails.setPayloads(payloadList);
        SessionDetails savedPayload = sdRepository.save(sessionDetails);

        return ResponseEntity.ok(savedPayload);
    }

    @PostMapping
    @Transactional
    public SessionDetails createSession(@RequestBody SessionDetails sessionDetails) {
        return sessionDetailsService.createSession(sessionDetails);
    }

    @GetMapping("/payload/{sessionId}")
    public List<Payload> getPayloadBySessionId(@PathVariable String sessionId) {
        SessionDetails sessionDetails = sdRepository.findBySessionId(sessionId)
                .orElseThrow(() -> new RuntimeException("SessionDetails not found for sessionId: " + sessionId));
        ;
        return sessionDetails.getPayloads();
    }

    @PutMapping("/{sessionId}")
    public ResponseEntity<SessionDetails> updateSession(
            @PathVariable String sessionId,
            @RequestBody SessionDetails updatedDetails) {
        try {
            return ResponseEntity.ok(sessionDetailsService.updateSession(sessionId, updatedDetails));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{sessionId}")
    public ResponseEntity<Void> deleteSession(@PathVariable String sessionId) {
        sessionDetailsService.deleteSession(sessionId);
        return ResponseEntity.noContent().build();
    }
}
