package com.ondc.yugabyte_integration.Repository;

import com.ondc.yugabyte_integration.Entity.Payload;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PayloadRepository extends JpaRepository<Payload, Long> {
}
