package com.candel.candel_overtime;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import java.util.ArrayList;
import com.candel.candel_overtime.MediaStoreSaver;

public class MainActivity extends BridgeActivity {
	@Override
	public void onCreate(android.os.Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		try {
			this.registerPlugin(MediaStoreSaver.class);
		} catch (Exception e) {
			// ignore registration errors
		}
	}
}
